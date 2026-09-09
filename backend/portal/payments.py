"""Stripe glue, kept out of views.py so the request-handling code
never has to know about Stripe's own object shapes - a view just
calls create_checkout_session() and gets back a URL to redirect to.
Payment is never marked complete here or in the view that calls
this - only webhooks.StripeWebhookView does that, once Stripe
itself confirms the charge succeeded.
"""
import stripe
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY


def create_checkout_session(
    *, amount, currency, description, success_url, cancel_url, metadata,
    customer_email=None,
):
    """Creates a one-off Stripe Checkout Session for `amount` (a
    Decimal in the workspace's major currency unit, e.g. euros not
    cents - this assumes a 2-decimal currency, matching how the
    rest of the app already formats and stores money). Raises
    stripe.error.StripeError on failure; the caller turns that into
    a clean 400 rather than a 500.
    """
    return stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {
                "price_data": {
                    "currency": currency.lower(),
                    "product_data": {"name": description},
                    "unit_amount": int(round(amount * 100)),
                },
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        customer_email=customer_email,
    )
