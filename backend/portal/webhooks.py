"""The Stripe webhook endpoint. This is the ONLY place a booking or
invoice is ever marked paid - never the checkout-session-creation
views, and never anything the client's own browser reports, since
either of those would let a client just claim they paid without
Stripe ever having charged them. A plain Django View (not DRF) on
purpose: signature verification needs the exact raw request body,
and DRF's request parsing can get in the way of that.
"""
import stripe
from django.conf import settings
from django.http import HttpResponse, HttpResponseBadRequest
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from .activity import log as log_activity
from .models import Booking, Invoice


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
            session = event["data"]["object"]
            metadata = session.get("metadata") or {}
            payment_intent_id = session.get("payment_intent") or ""
            if metadata.get("type") == "invoice":
                _mark_invoice_paid(metadata.get("invoice_id"), payment_intent_id)
            elif metadata.get("type") == "booking":
                _mark_booking_paid(metadata.get("booking_id"), payment_intent_id)

        return HttpResponse(status=200)


def _mark_invoice_paid(invoice_id, payment_intent_id):
    try:
        invoice = Invoice.objects.get(pk=invoice_id)
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


def _mark_booking_paid(booking_id, payment_intent_id):
    try:
        booking = Booking.objects.get(pk=booking_id)
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
