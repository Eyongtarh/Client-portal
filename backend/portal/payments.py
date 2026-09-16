"""Stripe glue, kept out of views.py so the request-handling code
never has to know about Stripe's own object shapes - a view just
calls create_checkout_session() and gets back a URL to redirect to.
Payment is never marked complete here or in the view that calls
this - only webhooks.StripeWebhookView does that, once Stripe
itself confirms the charge succeeded.
"""
import stripe
from django.conf import settings

from .currencies import to_stripe_amount

stripe.api_key = settings.STRIPE_SECRET_KEY


def create_checkout_session(
    *, amount, currency, description, success_url, cancel_url, metadata,
    customer_email=None, stripe_account=None,
):
    """Creates a one-off Stripe Checkout Session for `amount` (a
    Decimal in the workspace's major currency unit, e.g. euros, or
    XAF for a zero-decimal currency - however the rest of the app
    already formats and stores money for that workspace).
    to_stripe_amount() converts that into whatever integer Stripe's
    API actually wants for this specific currency - NOT always
    major-unit*100 (see currencies.py; a zero-decimal currency like
    XAF would otherwise get charged 100x too much). Raises
    stripe.error.StripeError on failure; the caller turns that into
    a clean 400 rather than a 500.

    `stripe_account`, when given (a workspace's connected Standard
    account id), creates the session directly ON that account - a
    Stripe Connect "direct charge". The money goes straight to the
    connected account's own balance, never through the platform's;
    Stripe also routes the resulting events to a separate Connect
    webhook subscription rather than the platform's own, which is
    why there are two webhook views/secrets (see webhooks.py).
    """
    return stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {
                "price_data": {
                    "currency": currency.lower(),
                    "product_data": {"name": description},
                    "unit_amount": to_stripe_amount(amount, currency),
                },
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        customer_email=customer_email,
        stripe_account=stripe_account,
    )
