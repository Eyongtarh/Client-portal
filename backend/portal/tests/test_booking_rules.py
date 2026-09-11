"""Booking rules (BOOK-11..16): holidays/blocked time, prep/recovery
buffers, minimum notice, maximum advance window, and daily/weekly
caps. Each rule is checked twice - once through AvailabilityView
(the slot list a client actually sees) and once through booking
creation itself (the real enforcement point, since a client could
otherwise just POST straight past whatever AvailabilityView offered).
"""
from datetime import time, timedelta

from django.test import TestCase
from django.utils import timezone

from portal.models import (
    BlockedTime, Booking, Client, Service, User, WorkingHours, Workspace,
)
from portal.tests.helpers import auth_client

MONDAY = "2027-06-07"  # a Monday, safely in the future


class BookingRulesTestCase(TestCase):
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
        self.service = Service.objects.create(
            workspace=self.workspace, name="Haircut", duration_minutes=60,
        )
        WorkingHours.objects.create(
            workspace=self.workspace,
            weekday=0,
            start_time=time(9, 0),
            end_time=time(12, 0),
        )

    def _slots(self, date=MONDAY):
        res = auth_client(self.owner).get(
            "/api/availability/", {"service": self.service.id, "date": date}
        )
        return res

    def _book(self, start_iso):
        return auth_client(self.client_user).post(
            "/api/bookings/",
            {"service": self.service.id, "start_time": start_iso},
        )


class HolidayAndBlockedTimeTests(BookingRulesTestCase):
    def test_a_holiday_removes_every_slot_that_day(self):
        BlockedTime.objects.create(
            workspace=self.workspace,
            start_time=f"{MONDAY}T00:00:00Z",
            end_time="2027-06-08T00:00:00Z",
            reason="Public holiday",
        )
        res = self._slots()
        self.assertEqual(res.data["slots"], [])

    def test_a_specific_block_only_removes_its_own_window(self):
        BlockedTime.objects.create(
            workspace=self.workspace,
            start_time=f"{MONDAY}T10:00:00Z",
            end_time=f"{MONDAY}T11:00:00Z",
            reason="Dentist",
        )
        res = self._slots()
        self.assertEqual(res.data["slots"], ["09:00", "11:00"])

    def test_booking_creation_is_rejected_inside_a_blocked_window(self):
        BlockedTime.objects.create(
            workspace=self.workspace,
            start_time=f"{MONDAY}T10:00:00Z",
            end_time=f"{MONDAY}T11:00:00Z",
        )
        res = self._book(f"{MONDAY}T10:00:00Z")
        self.assertEqual(res.status_code, 400)

    def test_booking_creation_succeeds_outside_the_blocked_window(self):
        BlockedTime.objects.create(
            workspace=self.workspace,
            start_time=f"{MONDAY}T10:00:00Z",
            end_time=f"{MONDAY}T11:00:00Z",
        )
        res = self._book(f"{MONDAY}T09:00:00Z")
        self.assertEqual(res.status_code, 201, res.data)


class BufferTests(BookingRulesTestCase):
    def test_buffer_after_blocks_the_immediately_following_slot(self):
        self.service.buffer_after_minutes = 60
        self.service.save(update_fields=["buffer_after_minutes"])
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            start_time=f"{MONDAY}T09:00:00Z",
            end_time=f"{MONDAY}T10:00:00Z",
        )
        res = self._slots()
        # 10:00 would normally be free right after a 09:00-10:00
        # booking, but a 1-hour recovery buffer pushes the next
        # available slot to 11:00.
        self.assertEqual(res.data["slots"], ["11:00"])

    def test_buffer_before_blocks_the_immediately_preceding_slot(self):
        self.service.buffer_before_minutes = 60
        self.service.save(update_fields=["buffer_before_minutes"])
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            start_time=f"{MONDAY}T10:00:00Z",
            end_time=f"{MONDAY}T11:00:00Z",
        )
        res = self._slots()
        # 09:00 sits inside the hour of prep time required before the
        # 10:00 booking; 11:00 (right after it ends, no buffer_after
        # set) remains free.
        self.assertEqual(res.data["slots"], ["11:00"])

    def test_booking_creation_is_rejected_inside_another_bookings_buffer(
        self,
    ):
        self.service.buffer_after_minutes = 60
        self.service.save(update_fields=["buffer_after_minutes"])
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            start_time=f"{MONDAY}T09:00:00Z",
            end_time=f"{MONDAY}T10:00:00Z",
        )
        res = self._book(f"{MONDAY}T10:00:00Z")
        self.assertEqual(res.status_code, 400)


class MinNoticeTests(BookingRulesTestCase):
    def test_a_notice_window_longer_than_the_date_is_out_excludes_every_slot(
        self,
    ):
        # MONDAY is only a few months out - a many-year notice
        # requirement guarantees every slot on it falls inside the
        # window, regardless of exactly when "now" is.
        self.service.min_notice_hours = 100000
        self.service.save(update_fields=["min_notice_hours"])
        res = self._slots()
        self.assertEqual(res.data["slots"], [])

    def test_no_notice_requirement_keeps_all_slots(self):
        self.service.min_notice_hours = 0
        self.service.save(update_fields=["min_notice_hours"])
        res = self._slots()
        self.assertEqual(res.data["slots"], ["09:00", "10:00", "11:00"])

    def test_booking_creation_is_rejected_inside_the_notice_window(self):
        self.service.min_notice_hours = 48
        self.service.save(update_fields=["min_notice_hours"])
        soon = timezone.now() + timedelta(hours=2)
        res = self._book(soon.isoformat())
        self.assertEqual(res.status_code, 400)

    def test_booking_creation_succeeds_outside_the_notice_window(self):
        self.service.min_notice_hours = 1
        self.service.save(update_fields=["min_notice_hours"])
        res = self._book(f"{MONDAY}T09:00:00Z")
        self.assertEqual(res.status_code, 201, res.data)


class MaxAdvanceTests(BookingRulesTestCase):
    def test_dates_beyond_the_advance_window_return_no_slots(self):
        self.service.max_advance_days = 1
        self.service.save(update_fields=["max_advance_days"])
        res = self._slots()
        self.assertEqual(res.data["slots"], [])

    def test_booking_creation_is_rejected_beyond_the_advance_window(self):
        self.service.max_advance_days = 1
        self.service.save(update_fields=["max_advance_days"])
        res = self._book(f"{MONDAY}T09:00:00Z")
        self.assertEqual(res.status_code, 400)


class DailyWeeklyCapTests(BookingRulesTestCase):
    def test_daily_cap_reached_returns_no_slots_that_day(self):
        self.service.max_bookings_per_day = 1
        self.service.save(update_fields=["max_bookings_per_day"])
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            start_time=f"{MONDAY}T09:00:00Z",
            end_time=f"{MONDAY}T10:00:00Z",
        )
        res = self._slots()
        self.assertEqual(res.data["slots"], [])

    def test_booking_creation_is_rejected_once_the_daily_cap_is_reached(self):
        self.service.max_bookings_per_day = 1
        self.service.save(update_fields=["max_bookings_per_day"])
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            start_time=f"{MONDAY}T09:00:00Z",
            end_time=f"{MONDAY}T10:00:00Z",
        )
        res = self._book(f"{MONDAY}T11:00:00Z")
        self.assertEqual(res.status_code, 400)

    def test_weekly_cap_reached_returns_no_slots_that_week(self):
        self.service.max_bookings_per_week = 1
        self.service.save(update_fields=["max_bookings_per_week"])
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            start_time=f"{MONDAY}T09:00:00Z",
            end_time=f"{MONDAY}T10:00:00Z",
        )
        res = self._slots()
        self.assertEqual(res.data["slots"], [])
