"""AvailabilityView (BOOK-04, BOOK-10, BOOK-19, TEAM-05): slot
computation had no per-staff notion at all before - one workspace-
wide calendar for every booking of a given service. These tests
lock in both the pre-existing workspace-default behavior (no
regressions) and the new ?staff=<id> scoping.
"""
from datetime import time

from django.test import TestCase
from django.utils import timezone

from portal.models import (
    Booking, Client, Service, User, WorkingHours, Workspace,
)
from portal.tests.helpers import auth_client

MONDAY = "2027-06-07"  # a Monday, safely in the future


class AvailabilityTestCase(TestCase):
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
        self.staff_a = User.objects.create_user(
            username="staffa",
            email="staffa@example.com",
            password="pw12345678",
            role="staff",
            staff_workspace=self.workspace,
        )
        self.staff_b = User.objects.create_user(
            username="staffb",
            email="staffb@example.com",
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
        self.service = Service.objects.create(
            workspace=self.workspace, name="Haircut", duration_minutes=60,
        )
        # Workspace default: Monday 09:00-11:00 (two 1-hour slots).
        WorkingHours.objects.create(
            workspace=self.workspace,
            weekday=0,
            start_time=time(9, 0),
            end_time=time(11, 0),
        )

    def _slots(self, user, staff=None):
        params = {"service": self.service.id, "date": MONDAY}
        if staff:
            params["staff"] = staff.id
        res = auth_client(user).get("/api/availability/", params)
        return res


class WorkspaceDefaultAvailabilityTests(AvailabilityTestCase):
    def test_slots_come_from_the_workspace_default_hours(self):
        res = self._slots(self.owner)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["slots"], ["09:00", "10:00"])

    def test_a_confirmed_booking_removes_its_slot(self):
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            start_time=f"{MONDAY}T09:00:00Z",
            end_time=f"{MONDAY}T10:00:00Z",
        )
        res = self._slots(self.owner)
        self.assertEqual(res.data["slots"], ["10:00"])


class StaffScopedAvailabilityTests(AvailabilityTestCase):
    def test_staff_with_no_custom_hours_falls_back_to_workspace_default(self):
        res = self._slots(self.owner, staff=self.staff_a)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["slots"], ["09:00", "10:00"])

    def test_staff_with_custom_hours_uses_only_their_own(self):
        WorkingHours.objects.create(
            workspace=self.workspace,
            staff=self.staff_a,
            weekday=0,
            start_time=time(14, 0),
            end_time=time(15, 0),
        )
        res = self._slots(self.owner, staff=self.staff_a)
        self.assertEqual(res.data["slots"], ["14:00"])

    def test_a_bookings_conflict_only_blocks_that_staff_members_slot(self):
        WorkingHours.objects.create(
            workspace=self.workspace,
            staff=self.staff_a,
            weekday=0,
            start_time=time(9, 0),
            end_time=time(11, 0),
        )
        WorkingHours.objects.create(
            workspace=self.workspace,
            staff=self.staff_b,
            weekday=0,
            start_time=time(9, 0),
            end_time=time(11, 0),
        )
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            staff=self.staff_a,
            start_time=f"{MONDAY}T09:00:00Z",
            end_time=f"{MONDAY}T10:00:00Z",
        )
        res_a = self._slots(self.owner, staff=self.staff_a)
        self.assertEqual(res_a.data["slots"], ["10:00"])
        res_b = self._slots(self.owner, staff=self.staff_b)
        self.assertEqual(res_b.data["slots"], ["09:00", "10:00"])

    def test_client_cannot_request_a_team_member_not_qualified_for_the_service(
        self,
    ):
        self.service.staff.add(self.staff_a)
        res = self._slots(self.client_user, staff=self.staff_b)
        self.assertEqual(res.status_code, 400)

    def test_client_can_request_a_qualified_team_member(self):
        self.service.staff.add(self.staff_a)
        res = self._slots(self.client_user, staff=self.staff_a)
        self.assertEqual(res.status_code, 200)
