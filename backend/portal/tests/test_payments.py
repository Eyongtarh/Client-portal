"""Stripe payment flow. The one invariant that actually matters
here is trust boundaries: a client's browser can never mark
anything paid by itself - only a verified webhook event can. Every
test below is really checking that boundary from one angle or
another (blocked without config, blocked cross-tenant, blocked
when there's nothing to pay, and the webhook - not the checkout
call - is what flips status).
"""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone

from portal.models import (
    Booking, Client, Invoice, InvoiceItem, Service, User, Workspace,
)
from portal.tests.helpers import auth_client


class PaymentTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="pw12345678",
            role="owner",
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner, name="Acme"
        )
        self.client_user = User.objects.create_user(
            username="client",
            email="client@example.com",
            password="pw12345678",
            role="client",
        )
        self.client_profile = Client.objects.create(
            workspace=self.workspace,
            user=self.client_user,
            company_name="Client Co",
            contact_email="client@example.com",
        )


def fake_session(session_id="cs_test_123", url="https://stripe.test/checkout"):
    session = MagicMock()
    session.id = session_id
    session.url = url
    return session


@override_settings(STRIPE_SECRET_KEY="sk_test_fake")
class InvoiceCheckoutTests(PaymentTestCase):
    def _invoice(self, amount="100.00"):
        invoice = Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="INV-1",
        )
        InvoiceItem.objects.create(
            invoice=invoice, description="Work", amount=Decimal(amount)
        )
        return invoice

    @patch("portal.views.create_checkout_session")
    def test_client_starts_checkout_and_session_id_is_saved(self, mock_cs):
        mock_cs.return_value = fake_session()
        invoice = self._invoice()
        res = auth_client(self.client_user).post(
            f"/api/invoices/{invoice.id}/checkout/"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["url"], "https://stripe.test/checkout")
        invoice.refresh_from_db()
        self.assertEqual(invoice.stripe_checkout_session_id, "cs_test_123")
        self.assertEqual(invoice.status, "draft")  # not paid by this call

    def test_owner_cannot_pay_a_client_invoice(self):
        invoice = self._invoice()
        res = auth_client(self.owner).post(
            f"/api/invoices/{invoice.id}/checkout/"
        )
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_pay_another_clients_invoice(self):
        other_client_user = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="pw12345678",
            role="client",
        )
        Client.objects.create(
            workspace=self.workspace,
            user=other_client_user,
            company_name="Other Co",
            contact_email="other@example.com",
        )
        invoice = self._invoice()
        res = auth_client(other_client_user).post(
            f"/api/invoices/{invoice.id}/checkout/"
        )
        self.assertEqual(res.status_code, 404)

    def test_already_paid_invoice_cannot_be_checked_out_again(self):
        invoice = self._invoice()
        invoice.status = "paid"
        invoice.save()
        res = auth_client(self.client_user).post(
            f"/api/invoices/{invoice.id}/checkout/"
        )
        self.assertEqual(res.status_code, 400)

    def test_zero_amount_invoice_is_rejected(self):
        invoice = Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="INV-2",
        )
        res = auth_client(self.client_user).post(
            f"/api/invoices/{invoice.id}/checkout/"
        )
        self.assertEqual(res.status_code, 400)


class InvoiceCheckoutNotConfiguredTests(PaymentTestCase):
    def test_checkout_blocked_when_stripe_not_configured(self):
        invoice = Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="INV-1",
        )
        InvoiceItem.objects.create(
            invoice=invoice, description="Work", amount=Decimal("50.00")
        )
        res = auth_client(self.client_user).post(
            f"/api/invoices/{invoice.id}/checkout/"
        )
        self.assertEqual(res.status_code, 400)


@override_settings(STRIPE_SECRET_KEY="sk_test_fake")
class BookingCheckoutTests(PaymentTestCase):
    def _pending_booking(self):
        service = Service.objects.create(
            workspace=self.workspace,
            name="Consult",
            duration_minutes=60,
            price=Decimal("100.00"),
            payment_requirement="deposit",
            deposit_percent=50,
        )
        return Booking.objects.create(
            workspace=self.workspace,
            service=service,
            client=self.client_profile,
            start_time=timezone.now() + timezone.timedelta(days=1),
            end_time=timezone.now() + timezone.timedelta(days=1, hours=1),
            payment_status="pending",
            payment_amount=Decimal("50.00"),
        )

    @patch("portal.views.create_checkout_session")
    def test_client_starts_checkout_for_pending_deposit(self, mock_cs):
        mock_cs.return_value = fake_session()
        booking = self._pending_booking()
        res = auth_client(self.client_user).post(
            f"/api/bookings/{booking.id}/checkout/"
        )
        self.assertEqual(res.status_code, 200, res.data)
        booking.refresh_from_db()
        self.assertEqual(booking.stripe_checkout_session_id, "cs_test_123")
        self.assertEqual(booking.payment_status, "pending")

    def test_booking_with_no_payment_due_cannot_be_checked_out(self):
        service = Service.objects.create(
            workspace=self.workspace,
            name="Free",
            duration_minutes=30,
        )
        booking = Booking.objects.create(
            workspace=self.workspace,
            service=service,
            client=self.client_profile,
            start_time=timezone.now() + timezone.timedelta(days=1),
            end_time=timezone.now() + timezone.timedelta(days=1, minutes=30),
        )
        res = auth_client(self.client_user).post(
            f"/api/bookings/{booking.id}/checkout/"
        )
        self.assertEqual(res.status_code, 400)

    @patch("portal.views.create_checkout_session")
    def test_already_paid_booking_cannot_be_checked_out_again(self, mock_cs):
        booking = self._pending_booking()
        booking.payment_status = "paid"
        booking.save()
        res = auth_client(self.client_user).post(
            f"/api/bookings/{booking.id}/checkout/"
        )
        self.assertEqual(res.status_code, 400)
        mock_cs.assert_not_called()


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_fake")
class StripeWebhookTests(PaymentTestCase):
    def _post_event(self, event):
        with patch("portal.webhooks.stripe.Webhook.construct_event") as mock_construct:
            mock_construct.return_value = event
            return self.client.post(
                "/api/stripe/webhook/",
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="fake",
            )

    def test_invalid_signature_is_rejected(self):
        with patch(
            "portal.webhooks.stripe.Webhook.construct_event",
            side_effect=ValueError("bad payload"),
        ):
            res = self.client.post(
                "/api/stripe/webhook/",
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="fake",
            )
        self.assertEqual(res.status_code, 400)

    def test_completed_checkout_marks_invoice_paid(self):
        invoice = Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="INV-1",
        )
        InvoiceItem.objects.create(
            invoice=invoice, description="Work", amount=Decimal("75.00")
        )
        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "metadata": {
                        "type": "invoice",
                        "invoice_id": str(invoice.id),
                    },
                    "payment_intent": "pi_test_1",
                }
            },
        }
        res = self._post_event(event)
        self.assertEqual(res.status_code, 200)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "paid")
        self.assertEqual(invoice.stripe_payment_intent_id, "pi_test_1")
        self.assertIsNotNone(invoice.paid_at)

    def test_completed_checkout_marks_booking_paid(self):
        service = Service.objects.create(
            workspace=self.workspace,
            name="Consult",
            duration_minutes=60,
            price=Decimal("100.00"),
            payment_requirement="full",
        )
        booking = Booking.objects.create(
            workspace=self.workspace,
            service=service,
            client=self.client_profile,
            start_time=timezone.now() + timezone.timedelta(days=1),
            end_time=timezone.now() + timezone.timedelta(days=1, hours=1),
            payment_status="pending",
            payment_amount=Decimal("100.00"),
        )
        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "metadata": {
                        "type": "booking",
                        "booking_id": str(booking.id),
                    },
                    "payment_intent": "pi_test_2",
                }
            },
        }
        res = self._post_event(event)
        self.assertEqual(res.status_code, 200)
        booking.refresh_from_db()
        self.assertEqual(booking.payment_status, "paid")
        self.assertEqual(booking.stripe_payment_intent_id, "pi_test_2")

    def test_unknown_invoice_id_does_not_error(self):
        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "metadata": {"type": "invoice", "invoice_id": "999999"},
                    "payment_intent": "pi_test_3",
                }
            },
        }
        res = self._post_event(event)
        self.assertEqual(res.status_code, 200)

    def test_already_paid_invoice_is_not_reprocessed(self):
        invoice = Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="INV-1",
            status="paid",
        )
        InvoiceItem.objects.create(
            invoice=invoice, description="Work", amount=Decimal("75.00")
        )
        original_paid_at = invoice.paid_at
        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "metadata": {
                        "type": "invoice",
                        "invoice_id": str(invoice.id),
                    },
                    "payment_intent": "pi_test_dupe",
                }
            },
        }
        self._post_event(event)
        invoice.refresh_from_db()
        self.assertEqual(invoice.paid_at, original_paid_at)
        self.assertEqual(invoice.stripe_payment_intent_id, "")
