"""Regression tests for two authorization gaps a security review
found: a client could PATCH an invoice's status straight to "paid"
(bypassing Stripe entirely), and could PATCH their own booking's
status to "no_show"/"completed" (evading the mark-no-show
owner/staff check and the late-cancellation fee logic, which only
fires on a transition to "cancelled").
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from portal.models import Booking, Client, Invoice, InvoiceItem, Service, User, Workspace
from portal.tests.helpers import auth_client


class AuthBoundaryTestCase(TestCase):
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


class InvoiceWriteAccessTests(AuthBoundaryTestCase):
    def _invoice(self, status="sent"):
        invoice = Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="INV-1",
            status=status,
        )
        InvoiceItem.objects.create(
            invoice=invoice, description="Work", amount=Decimal("100.00")
        )
        return invoice

    def test_client_cannot_mark_their_own_invoice_paid_directly(self):
        invoice = self._invoice()
        res = auth_client(self.client_user).patch(
            f"/api/invoices/{invoice.id}/", {"status": "paid"}
        )
        self.assertEqual(res.status_code, 403)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "sent")

    def test_client_cannot_create_an_invoice(self):
        res = auth_client(self.client_user).post(
            "/api/invoices/",
            {
                "client": self.client_profile.id,
                "number": "FAKE-1",
                "items": [{"description": "x", "amount": "1.00"}],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_delete_an_invoice(self):
        invoice = self._invoice()
        res = auth_client(self.client_user).delete(f"/api/invoices/{invoice.id}/")
        self.assertEqual(res.status_code, 403)
        self.assertTrue(Invoice.objects.filter(pk=invoice.id).exists())

    def test_client_can_still_read_their_own_invoice(self):
        invoice = self._invoice()
        res = auth_client(self.client_user).get(f"/api/invoices/{invoice.id}/")
        self.assertEqual(res.status_code, 200)

    def test_owner_can_still_mark_invoice_paid(self):
        invoice = self._invoice()
        res = auth_client(self.owner).patch(
            f"/api/invoices/{invoice.id}/", {"status": "paid"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "paid")


class BookingStatusTransitionTests(AuthBoundaryTestCase):
    def _booking(self, status="confirmed", start_delta=None):
        service = Service.objects.create(
            workspace=self.workspace, name="Consult", duration_minutes=60
        )
        start = timezone.now() + (start_delta or timezone.timedelta(days=3))
        return Booking.objects.create(
            workspace=self.workspace,
            service=service,
            client=self.client_profile,
            start_time=start,
            end_time=start + timezone.timedelta(hours=1),
            status=status,
        )

    def test_client_cannot_set_their_booking_to_no_show(self):
        booking = self._booking()
        res = auth_client(self.client_user).patch(
            f"/api/bookings/{booking.id}/", {"status": "no_show"}
        )
        self.assertEqual(res.status_code, 400)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "confirmed")

    def test_client_cannot_mark_their_own_booking_completed(self):
        booking = self._booking()
        res = auth_client(self.client_user).patch(
            f"/api/bookings/{booking.id}/", {"status": "completed"}
        )
        self.assertEqual(res.status_code, 400)

    def test_client_cannot_revive_a_no_show_back_to_confirmed(self):
        booking = self._booking(status="no_show")
        res = auth_client(self.client_user).patch(
            f"/api/bookings/{booking.id}/", {"status": "confirmed"}
        )
        self.assertEqual(res.status_code, 400)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "no_show")

    def test_client_can_still_cancel_their_own_booking(self):
        booking = self._booking()
        res = auth_client(self.client_user).patch(
            f"/api/bookings/{booking.id}/", {"status": "cancelled"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "cancelled")

    def test_owner_can_still_change_booking_status_freely(self):
        booking = self._booking()
        res = auth_client(self.owner).patch(
            f"/api/bookings/{booking.id}/", {"status": "completed"}
        )
        self.assertEqual(res.status_code, 200, res.data)
