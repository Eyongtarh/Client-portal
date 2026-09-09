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
from django.core.mail import send_mail
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
            # The installed stripe-python SDK returns a typed Session
            # object here, not a dict - it supports [] access but not
            # .get(), so convert once up front rather than sprinkle
            # [] vs .get() inconsistently below.
            session = event["data"]["object"].to_dict()
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
    booked_name = booking.service.name if booking.service else booking.resource.name
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
