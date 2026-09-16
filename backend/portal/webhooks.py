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
from .models import Booking, Invoice


def _handle_checkout_completed(session):
    metadata = session.get("metadata") or {}
    payment_intent_id = session.get("payment_intent") or ""
    if metadata.get("type") == "invoice":
        _mark_invoice_paid(metadata.get("invoice_id"), payment_intent_id)
    elif metadata.get("type") == "booking":
        _mark_booking_paid(metadata.get("booking_id"), payment_intent_id)


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(View):
    def post(self, request):
        try:
            event = stripe.Webhook.construct_event(
                request.body,
                request.META.get("HTTP_STRIPE_SIGNATURE", ""),
                settings.STRIPE_WEBHOOK_SECRET,
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            return HttpResponseBadRequest("Invalid payload or signature.")

        if event["type"] == "checkout.session.completed":
            # The installed stripe-python SDK returns a typed Session
            # object here, not a dict - it supports [] access but not
            # .get(), so convert once up front rather than sprinkle
            # [] vs .get() inconsistently below.
            _handle_checkout_completed(event["data"]["object"].to_dict())

        return HttpResponse(status=200)


@method_decorator(csrf_exempt, name="dispatch")
class StripeConnectWebhookView(View):
    """Same as StripeWebhookView, but for events on connected
    accounts - registered in the Dashboard as a webhook endpoint
    subscribed to "events on connected accounts" rather than "your
    account", with its own signing secret.
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

        if event["type"] == "checkout.session.completed":
            _handle_checkout_completed(event["data"]["object"].to_dict())

        return HttpResponse(status=200)


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
