"""Booking analytics (BOOK-76..79): demand, cancellation/no-show
rates, breakdowns by service/staff/location, and revenue - all
derived straight from Booking rows, so each check sets up a small,
known set of bookings and asserts the exact numbers back out.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from portal.models import Client, Service, User, Workspace, Booking
from portal.tests.helpers import auth_client


class BookingAnalyticsTestCase(TestCase):
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
            first_name="Staffer",
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
        self.haircut = Service.objects.create(
            workspace=self.workspace, name="Haircut", duration_minutes=60,
            location="Main St", price=Decimal("50.00"),
        )
        self.online_consult = Service.objects.create(
            workspace=self.workspace, name="Consult", duration_minutes=30,
            is_online=True, price=Decimal("20.00"),
        )

    def _booking(self, service, status="confirmed", staff=None, **kwargs):
        start = kwargs.pop("start_time", timezone.now() + timedelta(days=1))
        return Booking.objects.create(
            workspace=self.workspace,
            service=service,
            client=self.client_profile,
            staff=staff,
            status=status,
            start_time=start,
            end_time=start + timedelta(minutes=service.duration_minutes),
            **kwargs,
        )


class AccessControlTests(BookingAnalyticsTestCase):
    def test_client_cannot_view_analytics(self):
        res = auth_client(self.client_user).get("/api/booking-analytics/")
        self.assertEqual(res.status_code, 403)

    def test_owner_can_view_analytics(self):
        res = auth_client(self.owner).get("/api/booking-analytics/")
        self.assertEqual(res.status_code, 200)

    def test_staff_can_view_analytics(self):
        res = auth_client(self.staff).get("/api/booking-analytics/")
        self.assertEqual(res.status_code, 200)


class StatusBreakdownTests(BookingAnalyticsTestCase):
    def test_totals_and_rates_are_correct(self):
        self._booking(self.haircut, status="confirmed")
        self._booking(self.haircut, status="confirmed")
        self._booking(self.haircut, status="cancelled")
        self._booking(self.haircut, status="no_show")
        res = auth_client(self.owner).get("/api/booking-analytics/")
        self.assertEqual(res.data["total_bookings"], 4)
        self.assertEqual(res.data["status_breakdown"]["confirmed"], 2)
        self.assertEqual(res.data["status_breakdown"]["cancelled"], 1)
        self.assertEqual(res.data["status_breakdown"]["no_show"], 1)
        self.assertEqual(res.data["cancellation_rate"], 25.0)
        self.assertEqual(res.data["no_show_rate"], 25.0)

    def test_no_bookings_gives_zero_rates_not_a_crash(self):
        res = auth_client(self.owner).get("/api/booking-analytics/")
        self.assertEqual(res.data["total_bookings"], 0)
        self.assertEqual(res.data["cancellation_rate"], 0.0)
        self.assertEqual(res.data["no_show_rate"], 0.0)


class BreakdownTests(BookingAnalyticsTestCase):
    def test_by_service_counts_each_service_separately(self):
        self._booking(self.haircut)
        self._booking(self.haircut)
        self._booking(self.online_consult)
        res = auth_client(self.owner).get("/api/booking-analytics/")
        by_service = {r["name"]: r["count"] for r in res.data["by_service"]}
        self.assertEqual(by_service["Haircut"], 2)
        self.assertEqual(by_service["Consult"], 1)

    def test_by_staff_groups_unassigned_bookings(self):
        self._booking(self.haircut, staff=self.staff)
        self._booking(self.haircut)
        res = auth_client(self.owner).get("/api/booking-analytics/")
        by_staff = {r["name"]: r["count"] for r in res.data["by_staff"]}
        self.assertEqual(by_staff["Staffer"], 1)
        self.assertEqual(by_staff["Unassigned"], 1)

    def test_by_location_groups_online_and_in_person(self):
        self._booking(self.haircut)
        self._booking(self.online_consult)
        self._booking(self.online_consult)
        res = auth_client(self.owner).get("/api/booking-analytics/")
        by_location = {r["location"]: r["count"] for r in res.data["by_location"]}
        self.assertEqual(by_location["Main St"], 1)
        self.assertEqual(by_location["Online"], 2)


class RevenueTests(BookingAnalyticsTestCase):
    def test_paid_and_pending_revenue_are_summed_separately(self):
        self._booking(
            self.haircut, payment_status="paid", payment_amount=Decimal("50.00"),
        )
        self._booking(
            self.haircut, payment_status="paid", payment_amount=Decimal("50.00"),
        )
        self._booking(
            self.online_consult,
            payment_status="pending",
            payment_amount=Decimal("20.00"),
        )
        res = auth_client(self.owner).get("/api/booking-analytics/")
        self.assertEqual(Decimal(res.data["revenue"]["paid"]), Decimal("100.00"))
        self.assertEqual(Decimal(res.data["revenue"]["pending"]), Decimal("20.00"))

    def test_no_paid_bookings_gives_zero_not_none(self):
        res = auth_client(self.owner).get("/api/booking-analytics/")
        self.assertEqual(Decimal(res.data["revenue"]["paid"]), Decimal("0"))


class DailyCountsTests(BookingAnalyticsTestCase):
    def test_a_booking_today_appears_in_the_daily_counts(self):
        self._booking(self.haircut, start_time=timezone.now())
        res = auth_client(self.owner).get("/api/booking-analytics/")
        today = timezone.now().date().isoformat()
        dates = {row["date"]: row["count"] for row in res.data["daily_counts"]}
        self.assertEqual(dates.get(today), 1)
