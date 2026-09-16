"""Stripe glue for PLATFORM subscription billing (SUB-01..15) - the
workspace owner paying US for their Pro/Business plan. Kept separate
from payments.py, which is the unrelated flow of a CLIENT paying a
workspace owner through the owner's OWN connected Stripe account
(Connect, a direct charge). Nothing in this module ever passes
stripe_account=... - every call here happens on the platform's own
Stripe account, identified by the workspace's stripe_customer_id.
"""
import stripe
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY


def get_or_create_customer(workspace):
    """Returns this workspace's platform Stripe customer id,
    creating one on first use. A workspace should only ever get
    one - reused across every later checkout/portal/history call.
    """
    if workspace.stripe_customer_id:
        return workspace.stripe_customer_id
    customer = stripe.Customer.create(
        email=workspace.owner.email,
        name=workspace.name,
        metadata={"workspace_id": str(workspace.id)},
    )
    workspace.stripe_customer_id = customer.id
    workspace.save(update_fields=["stripe_customer_id"])
    return customer.id


def create_subscription_checkout_session(
    *, workspace, plan, success_url, cancel_url
):
    """A mode="subscription" Checkout Session for moving a
    workspace onto a paid plan for the first time (SUB-02). The
    workspace/plan ids are stamped into both the session's and the
    resulting subscription's metadata so webhooks.py can identify
    them from either a checkout.session.completed event or a later
    customer.subscription.* event, without depending on which one
    arrives first.
    """
    customer_id = get_or_create_customer(workspace)
    metadata = {"workspace_id": str(workspace.id), "plan_id": str(plan.id)}
    return stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": plan.stripe_price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        subscription_data={"metadata": metadata},
    )


def create_billing_portal_session(*, workspace, return_url):
    """SUB-08: lets the owner update their card, download Stripe-
    hosted receipts, or cancel, using Stripe's own hosted UI rather
    than the app re-implementing payment-method management.
    """
    customer_id = get_or_create_customer(workspace)
    return stripe.billing_portal.Session.create(
        customer=customer_id, return_url=return_url,
    )


def modify_subscription_price(subscription, new_price_id):
    """SUB-04: moves an ALREADY ACTIVE Stripe subscription between
    two paid prices (Pro <-> Business), prorating the difference -
    rather than cancelling and starting a new one, which would lose
    the existing renewal date and force an immediate fresh charge.
    """
    stripe_sub = stripe.Subscription.retrieve(
        subscription.stripe_subscription_id
    )
    item_id = stripe_sub["items"]["data"][0]["id"]
    return stripe.Subscription.modify(
        subscription.stripe_subscription_id,
        items=[{"id": item_id, "price": new_price_id}],
        proration_behavior="create_prorations",
    )


def cancel_subscription(subscription, at_period_end=True):
    """SUB-05: stops future billing. at_period_end=True keeps the
    paid plan active until the period already paid for ends -
    standard SaaS cancellation UX; Stripe fires
    customer.subscription.updated right away (with
    cancel_at_period_end=True) and customer.subscription.deleted
    once the period actually ends, both handled in webhooks.py.
    at_period_end=False ends it immediately instead, for an owner
    who explicitly switches back to Free rather than merely
    cancelling (see views.ChangePlanView).
    """
    if at_period_end:
        return stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            cancel_at_period_end=True,
        )
    return stripe.Subscription.delete(subscription.stripe_subscription_id)


def list_billing_history(workspace, limit=24):
    """SUB-07: past platform subscription invoices for this
    workspace, read straight from Stripe rather than mirrored
    locally - Stripe is already the source of truth for these and
    this is read-only, so there's nothing to gain from a local copy
    that could drift out of sync.
    """
    if not workspace.stripe_customer_id:
        return []
    invoices = stripe.Invoice.list(
        customer=workspace.stripe_customer_id, limit=limit,
    )
    return invoices.data
