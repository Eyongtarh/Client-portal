"""Deposit/full-payment and cancellation-policy math (BOOK-39,
BOOK-41, BOOK-42, BOOK-72, BOOK-73, BOOK-75). These are pure money
and timing calculations - exactly the kind of thing that's easy to
get subtly wrong (off-by-one on the notice window, wrong rounding,
percent vs fraction) and where a wrong answer is a real billing
bug, so each rule gets a direct test rather than trusting the
arithmetic by inspection.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from portal.models import Booking, Client, Service, User, Workspace
from portal.tests.helpers import auth_client


class BookingPolicyTestCase(TestCase):
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
        self.staff = User.objects.create_user(
            username="staff",
            email="staff@example.com",
            password="pw12345678",
            role="staff",
            staff_workspace=self.workspace,
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


class ServicePolicyValidationTests(BookingPolicyTestCase):
    def test_deposit_requirement_needs_a_deposit_percent(self):
        res = auth_client(self.owner).post(
            "/api/services/",
            {
                "name": "Consultation",
                "duration_minutes": 60,
                "price": "100.00",
                "payment_requirement": "deposit",
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_deposit_percent_must_be_in_range(self):
        res = auth_client(self.owner).post(
            "/api/services/",
            {
                "name": "Consultation",
                "duration_minutes": 60,
                "price": "100.00",
                "payment_requirement": "deposit",
                "deposit_percent": 150,
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_valid_deposit_policy_is_accepted(self):
        res = auth_client(self.owner).post(
            "/api/services/",
            {
                "name": "Consultation",
                "duration_minutes": 60,
                "price": "100.00",
                "payment_requirement": "deposit",
                "deposit_percent": 25,
            },
        )
        self.assertEqual(res.status_code, 201, res.data)


class BookingPaymentAmountTests(BookingPolicyTestCase):
    def _book(self, service, start):
        return auth_client(self.client_user).post(
            "/api/bookings/",
            {"service": service.id, "start_time": start.isoformat()},
        )

    def test_deposit_service_charges_only_the_deposit_percent(self):
        service = Service.objects.create(
            workspace=self.workspace,
            name="Photoshoot",
            duration_minutes=60,
            price=Decimal("200.00"),
            payment_requirement="deposit",
            deposit_percent=30,
        )
        start = timezone.now() + timedelta(days=3)
        res = self._book(service, start)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["payment_status"], "pending")
        self.assertEqual(Decimal(res.data["payment_amount"]), Decimal("60.00"))

    def test_full_payment_service_charges_the_whole_price(self):
        service = Service.objects.create(
            workspace=self.workspace,
            name="Workshop",
            duration_minutes=60,
            price=Decimal("150.00"),
            payment_requirement="full",
        )
        start = timezone.now() + timedelta(days=3)
        res = self._book(service, start)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(
            Decimal(res.data["payment_amount"]), Decimal("150.00")
        )

    def test_no_payment_service_never_sets_an_amount(self):
        service = Service.objects.create(
            workspace=self.workspace,
            name="Free consult",
            duration_minutes=30,
            price=Decimal("0.00"),
        )
        start = timezone.now() + timedelta(days=3)
        res = self._book(service, start)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["payment_status"], "not_required")
        self.assertIsNone(res.data["payment_amount"])

    def test_client_cannot_spoof_payment_status(self):
        service = Service.objects.create(
            workspace=self.workspace,
            name="Consult",
            duration_minutes=30,
            price=Decimal("50.00"),
        )
        start = timezone.now() + timedelta(days=3)
        res = auth_client(self.client_user).post(
            "/api/bookings/",
            {
                "service": service.id,
                "start_time": start.isoformat(),
                "payment_status": "paid",
                "payment_amount": "999.00",
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["payment_status"], "not_required")
        self.assertIsNone(res.data["payment_amount"])


class LateCancellationTests(BookingPolicyTestCase):
    def _make_booking(self, notice_hours, fee_percent, start_delta):
        service = Service.objects.create(
            workspace=self.workspace,
            name="Session",
            duration_minutes=60,
            price=Decimal("80.00"),
            cancellation_notice_hours=notice_hours,
            late_cancellation_fee_percent=fee_percent,
        )
        return Booking.objects.create(
            workspace=self.workspace,
            service=service,
            client=self.client_profile,
            start_time=timezone.now() + start_delta,
            end_time=timezone.now() + start_delta + timedelta(minutes=60),
        )

    def test_cancelling_inside_notice_window_is_flagged_late(self):
        booking = self._make_booking(
            notice_hours=24, fee_percent=50, start_delta=timedelta(hours=2)
        )
        res = auth_client(self.client_user).patch(
            f"/api/bookings/{booking.id}/", {"status": "cancelled"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["is_late_cancellation"])

    def test_cancelling_outside_notice_window_is_not_flagged(self):
        booking = self._make_booking(
            notice_hours=24, fee_percent=50, start_delta=timedelta(days=5)
        )
        res = auth_client(self.client_user).patch(
            f"/api/bookings/{booking.id}/", {"status": "cancelled"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(res.data["is_late_cancellation"])

    def test_no_fee_configured_never_flags_late(self):
        booking = self._make_booking(
            notice_hours=24, fee_percent=None, start_delta=timedelta(hours=1)
        )
        res = auth_client(self.client_user).patch(
            f"/api/bookings/{booking.id}/", {"status": "cancelled"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(res.data["is_late_cancellation"])


class NoShowActionTests(BookingPolicyTestCase):
    def setUp(self):
        super().setUp()
        service = Service.objects.create(
            workspace=self.workspace,
            name="Session",
            duration_minutes=60,
            price=Decimal("80.00"),
        )
        self.booking = Booking.objects.create(
            workspace=self.workspace,
            service=service,
            client=self.client_profile,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(hours=1),
        )

    def test_owner_can_mark_no_show(self):
        res = auth_client(self.owner).post(
            f"/api/bookings/{self.booking.id}/mark-no-show/"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["status"], "no_show")

    def test_client_cannot_mark_no_show(self):
        res = auth_client(self.client_user).post(
            f"/api/bookings/{self.booking.id}/mark-no-show/"
        )
        self.assertEqual(res.status_code, 403)

    def test_other_workspace_owner_cannot_mark_no_show(self):
        other_owner = User.objects.create_user(
            username="otherowner",
            email="otherowner@example.com",
            password="pw12345678",
            role="owner",
        )
        Workspace.objects.create(owner=other_owner, name="Other Co")
        res = auth_client(other_owner).post(
            f"/api/bookings/{self.booking.id}/mark-no-show/"
        )
        self.assertEqual(res.status_code, 404)
