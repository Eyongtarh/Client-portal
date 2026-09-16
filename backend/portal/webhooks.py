"""The Stripe webhook endpoints. This is the ONLY place a booking or
invoice is ever marked paid - never the checkout-session-creation
views, and never anything the client's own browser reports, since
either of those would let a client just claim they paid without
Stripe ever having charged them. Plain Django Views (not DRF) on
purpose: signature verification needs the exact raw request body,
and DRF's request parsing can get in the way of that.

There are two endpoints because Stripe delivers events from two
different places, each needing its own registered webhook + signing
secret in the Dashboard:
- StripeWebhookView: events on the platform's own account.
- StripeConnectWebhookView: events on a connected account (a direct
  charge created with `stripe_account=...` in payments.py, once a
  workspace owner has linked their own Stripe account via Connect -
  see views.WorkspaceStripeConnect*). A checkout paid through a
  connected account is NEVER reported to the platform endpoint.
"""
from datetime import datetime, timezone as dt_timezone

import logging

import stripe
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.http import HttpResponse, HttpResponseBadRequest
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from .activity import log as log_activity
from .models import (
    Booking, Invoice, ProcessedStripeEvent, Subscription, SubscriptionPlan,
    Workspace,
)

logger = logging.getLogger(__name__)


def _already_processed(event_id):
    """SUB-10: True (and records it) the first time an event id is
    seen, so every event is handled exactly once even if Stripe
    redelivers it (timeouts, retries, or - during testing - the same
    event landing on both this endpoint and the Connect one).
    """
    _, created = ProcessedStripeEvent.objects.get_or_create(
        event_id=event_id
    )
    return not created


def _handle_checkout_completed(session):
    metadata = session.get("metadata") or {}
    payment_intent_id = session.get("payment_intent") or ""
    if metadata.get("type") == "invoice":
        _mark_invoice_paid(metadata.get("invoice_id"), payment_intent_id)
    elif metadata.get("type") == "booking":
        _mark_booking_paid(metadata.get("booking_id"), payment_intent_id)


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(View):
    """Events on the platform's OWN Stripe account - both one-off
    invoice/booking Checkout Sessions created without
    stripe_account=... (see payments.py) and, for SUB-09/10, the
    workspace-owner-pays-the-platform subscription lifecycle (see
    platform_billing.py). A connected account's own events never
    land here - see StripeConnectWebhookView below.
    """
    def post(self, request):
        try:
            event = stripe.Webhook.construct_event(
                request.body,
                request.META.get("HTTP_STRIPE_SIGNATURE", ""),
                settings.STRIPE_WEBHOOK_SECRET,
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            return HttpResponseBadRequest("Invalid payload or signature.")

        event_type = event["type"]
        # The installed stripe-python SDK returns a typed object
        # here, not a dict - it supports [] access but not .get(),
        # so convert once up front rather than sprinkle [] vs .get()
        # inconsistently below.
        obj = event["data"]["object"].to_dict()

        # Recording the event id and handling it share ONE
        # transaction: if a handler raises (say the Stripe API call
        # inside it times out), the id is rolled back too, Stripe's
        # retry is treated as a first delivery, and the owner who
        # already paid still gets upgraded. Recording first and
        # handling after would swallow that retry as "already seen".
        with transaction.atomic():
            if _already_processed(event["id"]):
                return HttpResponse(status=200)
            if event_type == "checkout.session.completed":
                if obj.get("mode") == "subscription":
                    _handle_subscription_checkout_completed(obj)
                else:
                    _handle_checkout_completed(obj)
            elif event_type == "customer.subscription.updated":
                _sync_subscription_from_stripe(obj)
            elif event_type == "customer.subscription.deleted":
                _handle_subscription_deleted(obj)
            elif event_type == "invoice.payment_failed":
                _handle_subscription_payment_failed(obj)

        return HttpResponse(status=200)


@method_decorator(csrf_exempt, name="dispatch")
class StripeConnectWebhookView(View):
    """Same as StripeWebhookView, but for events on connected
    accounts - registered in the Dashboard as a webhook endpoint
    subscribed to "events on connected accounts" rather than "your
    account", with its own signing secret. Connected accounts are
    always a workspace owner's OWN account for client payments
    (payments.py) - platform subscription billing never touches a
    connected account, so there's nothing subscription-related to
    handle here.
    """
    def post(self, request):
        try:
            event = stripe.Webhook.construct_event(
                request.body,
                request.META.get("HTTP_STRIPE_SIGNATURE", ""),
                settings.STRIPE_CONNECT_WEBHOOK_SECRET,
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            return HttpResponseBadRequest("Invalid payload or signature.")

        # Same record-and-handle-in-one-transaction rule as
        # StripeWebhookView, so a handler failure is retried.
        with transaction.atomic():
            if _already_processed(event["id"]):
                return HttpResponse(status=200)
            if event["type"] == "checkout.session.completed":
                _handle_checkout_completed(
                    event["data"]["object"].to_dict()
                )

        return HttpResponse(status=200)


def _workspace_for_stripe_subscription(stripe_sub):
    """Finds the workspace a raw Stripe subscription dict belongs
    to, trying the most reliable source first: our own metadata
    (stamped at checkout), then an existing local Subscription row,
    then falling back to matching Stripe's customer id - covers a
    subscription.updated event arriving before we've ever stored
    its subscription id (e.g. a plan change made directly in
    Stripe's Dashboard).
    """
    metadata = stripe_sub.get("metadata") or {}
    workspace_id = metadata.get("workspace_id")
    if workspace_id:
        workspace = Workspace.objects.filter(pk=workspace_id).first()
        if workspace:
            return workspace
    existing = (
        Subscription.objects.filter(
            stripe_subscription_id=stripe_sub["id"]
        )
        .select_related("workspace")
        .first()
    )
    if existing:
        return existing.workspace
    customer_id = stripe_sub.get("customer")
    if customer_id:
        return Workspace.objects.filter(
            stripe_customer_id=customer_id
        ).first()
    return None


def _upsert_subscription(workspace, stripe_sub, plan_id=None):
    """Writes Stripe's view of the subscription into the local
    Subscription row, and - only while the subscription is actually
    paying (active/trialing) - promotes workspace.plan to match, so
    every existing LIMIT-01/02/03 check (which reads workspace.plan,
    not Subscription) picks up the new tier immediately. Reverting
    workspace.plan when a subscription lapses is handled separately
    by the callers that know it lapsed (_sync_subscription_from_
    stripe, _handle_subscription_deleted), not here, since "upsert"
    itself shouldn't guess whether an update means keep or downgrade.
    """
    plan = None
    if plan_id:
        plan = SubscriptionPlan.objects.filter(pk=plan_id).first()
    if plan is None:
        price_id = stripe_sub["items"]["data"][0]["price"]["id"]
        plan = SubscriptionPlan.objects.filter(
            stripe_price_id=price_id
        ).first()

    # Newer Stripe API versions moved current_period_end from the
    # subscription onto its items, so read either.
    period_end = stripe_sub.get("current_period_end") or (
        stripe_sub["items"]["data"][0].get("current_period_end")
    )
    defaults = {"plan": plan} if plan else {}
    subscription, _ = Subscription.objects.update_or_create(
        workspace=workspace,
        defaults={
            **defaults,
            "stripe_subscription_id": stripe_sub["id"],
            "status": stripe_sub["status"],
            "current_period_end": (
                datetime.fromtimestamp(period_end, tz=dt_timezone.utc)
                if period_end else None
            ),
            "cancel_at_period_end": bool(
                stripe_sub.get("cancel_at_period_end")
            ),
        },
    )
    if plan and stripe_sub["status"] in ("active", "trialing"):
        if workspace.plan_id != plan.id:
            workspace.plan = plan
            workspace.save(update_fields=["plan"])
    return subscription


def _is_stale_subscription_event(workspace, stripe_sub):
    """True when this event is about a DIFFERENT Stripe subscription
    from the one the workspace is currently paying for - e.g. the
    delayed `deleted` event of an old, cancelled subscription landing
    after the owner has already resubscribed. Applying it would
    overwrite the live subscription and drop a paying owner to Free.
    """
    current = getattr(workspace, "subscription", None)
    return bool(
        current
        and current.stripe_subscription_id
        and current.stripe_subscription_id != stripe_sub["id"]
        and current.status in ("active", "trialing", "past_due")
    )


def _revert_to_free(workspace):
    free_plan = SubscriptionPlan.objects.filter(name="Free").first()
    if free_plan and workspace.plan_id != free_plan.id:
        workspace.plan = free_plan
        workspace.save(update_fields=["plan"])


def _handle_subscription_checkout_completed(session):
    """SUB-02/09: the owner's first successful payment for a paid
    plan. Re-fetches the subscription from Stripe (rather than
    trusting the checkout session alone) so status/current_period_
    end/price are the real, current values, not just "it worked".
    """
    metadata = session.get("metadata") or {}
    workspace_id = metadata.get("workspace_id")
    plan_id = metadata.get("plan_id")
    stripe_subscription_id = session.get("subscription")
    if not (workspace_id and stripe_subscription_id):
        return
    workspace = Workspace.objects.filter(pk=workspace_id).first()
    if not workspace:
        return
    session_customer = session.get("customer")
    if (
        workspace.stripe_customer_id
        and session_customer
        and session_customer != workspace.stripe_customer_id
    ):
        logger.error(
            "Ignoring subscription checkout %s: customer %s does not "
            "belong to workspace %s", stripe_subscription_id,
            session_customer, workspace.id,
        )
        return
    if _is_stale_subscription_event(
        workspace, {"id": stripe_subscription_id}
    ):
        # A second checkout completed while one subscription is
        # already live (two tabs, a double click). Keep the first and
        # cancel the duplicate so the owner isn't billed twice; its
        # first charge needs a manual refund, hence the loud log.
        logger.error(
            "Duplicate subscription %s for workspace %s; cancelling "
            "it. Refund its first charge manually.",
            stripe_subscription_id, workspace.id,
        )
        stripe.Subscription.delete(stripe_subscription_id)
        return
    stripe_sub = stripe.Subscription.retrieve(stripe_subscription_id)
    subscription = _upsert_subscription(
        workspace, stripe_sub, plan_id=plan_id
    )
    plan_name = workspace.plan.name if workspace.plan else ""
    log_activity(
        workspace, None, "subscription_started", subscription,
        metadata={"plan": plan_name},
    )
    send_mail(
        subject=f"Your {plan_name} subscription is active",
        message=(
            f"Thanks for subscribing to the {plan_name} plan - your "
            f"workspace now has {plan_name} limits."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[workspace.owner.email],
        fail_silently=True,
    )


def _sync_subscription_from_stripe(stripe_sub):
    """SUB-04/09: any change Stripe reports on an existing
    subscription - renewal, upgrade/downgrade, a payment going
    past_due, or cancel_at_period_end being toggled.
    """
    workspace = _workspace_for_stripe_subscription(stripe_sub)
    if not workspace or _is_stale_subscription_event(workspace, stripe_sub):
        return
    previous = getattr(workspace, "subscription", None)
    previous_status = previous.status if previous else None
    subscription = _upsert_subscription(workspace, stripe_sub)
    if stripe_sub["status"] in ("canceled", "incomplete_expired", "unpaid"):
        _revert_to_free(workspace)
    if stripe_sub["status"] != previous_status:
        log_activity(
            workspace, None, "subscription_updated", subscription,
            metadata={"status": stripe_sub["status"]},
        )


def _handle_subscription_deleted(stripe_sub):
    """SUB-05/09: the subscription has fully ended (either the
    owner cancelled and the paid period just ran out, or Stripe gave
    up after repeated failed payments) - workspace access reverts to
    Free right away.
    """
    workspace = _workspace_for_stripe_subscription(stripe_sub)
    if not workspace or _is_stale_subscription_event(workspace, stripe_sub):
        return
    subscription = _upsert_subscription(workspace, stripe_sub)
    _revert_to_free(workspace)
    log_activity(workspace, None, "subscription_canceled", subscription)
    send_mail(
        subject="Your subscription has ended",
        message=(
            f"Your Stripe subscription for {workspace.name} has ended "
            "and the workspace is now back on the Free plan."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[workspace.owner.email],
        fail_silently=True,
    )


def _handle_subscription_payment_failed(stripe_invoice):
    """SUB-15: a renewal charge failed. Doesn't touch workspace.plan
    itself - Stripe retries automatically per its own retry
    schedule, and only actually ends the subscription (triggering
    _handle_subscription_deleted) once it gives up - this is purely
    the "let the owner know" step.
    """
    customer_id = stripe_invoice.get("customer")
    if not customer_id:
        return
    workspace = Workspace.objects.filter(
        stripe_customer_id=customer_id
    ).first()
    if not workspace:
        return
    subscription = getattr(workspace, "subscription", None)
    log_activity(
        workspace, None, "subscription_payment_failed",
        subscription or workspace,
    )
    send_mail(
        subject="A subscription payment failed",
        message=(
            f"A payment for {workspace.name}'s subscription failed. "
            "Please update your billing details to avoid losing your "
            "current plan."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[workspace.owner.email],
        fail_silently=True,
    )


def _mark_invoice_paid(invoice_id, payment_intent_id):
    # select_for_update() + atomic closes a real (if narrow) race: two
    # near-simultaneous webhook deliveries for the same event (Stripe
    # does redeliver) could otherwise both read status != "paid"
    # before either write commits, and both send the "you got paid"
    # email. Locking the row makes the second delivery wait for the
    # first to commit, so its own check-then-act sees the update.
    with transaction.atomic():
        try:
            invoice = Invoice.objects.select_for_update().get(pk=invoice_id)
        except (Invoice.DoesNotExist, ValueError, TypeError):
            return
        if invoice.status == "paid":
            return
        invoice.status = "paid"
        invoice.paid_at = timezone.now()
        invoice.stripe_payment_intent_id = payment_intent_id
        invoice.save(
            update_fields=["status", "paid_at", "stripe_payment_intent_id"]
        )
    log_activity(
        invoice.workspace,
        None,
        "invoice_paid",
        invoice,
        client=invoice.client,
        metadata={"total": str(invoice.total)},
    )
    send_mail(
        subject=f"Payment confirmed: invoice #{invoice.number}",
        message=(
            f"Invoice #{invoice.number} "
            f"({invoice.total} {invoice.workspace.currency}) was just "
            f"paid online by {invoice.client.company_name}."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invoice.workspace.owner.email],
        fail_silently=True,
    )


def _mark_booking_paid(booking_id, payment_intent_id):
    # See the matching comment in _mark_invoice_paid - same narrow
    # duplicate-delivery race, same fix.
    with transaction.atomic():
        try:
            booking = Booking.objects.select_for_update().get(pk=booking_id)
        except (Booking.DoesNotExist, ValueError, TypeError):
            return
        if booking.payment_status == "paid":
            return
        booking.payment_status = "paid"
        booking.stripe_payment_intent_id = payment_intent_id
        booking.save(
            update_fields=["payment_status", "stripe_payment_intent_id"]
        )
    log_activity(
        booking.workspace,
        None,
        "booking_payment_received",
        booking,
        client=booking.client,
    )
    booked_name = booking.display_name
    send_mail(
        subject=f"Payment received: {booked_name}",
        message=(
            f"{booking.client.company_name} just paid "
            f"{booking.payment_amount} {booking.workspace.currency} for "
            f"their booking on "
            f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[booking.workspace.owner.email],
        fail_silently=True,
    )
