"""Guest/public booking (BOOK-21/26/27/28/30): a workspace that
opts in via public_booking_enabled lets anyone with the link view
its services, check availability, and book - all without an
account - while every existing booking rule (capacity, buffers,
notice, blocked time, caps, cross-workspace scoping) still applies.
"""
from datetime import time

from django.test import TestCase
from rest_framework.test import APIClient

from portal.models import (
    BlockedTime, Booking, Client, Service, User, WorkingHours, Workspace,
)

MONDAY = "2027-06-07"  # a Monday, safely in the future


class PublicBookingTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="pw12345678",
            role="owner",
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner, name="Acme", public_booking_enabled=True,
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
        self.api = APIClient()

    def _book(self, **overrides):
        payload = {
            "service": self.service.id,
            "start_time": f"{MONDAY}T09:00:00Z",
            "client_name": "Jamie Guest",
            "client_email": "jamie@example.com",
        }
        payload.update(overrides)
        return self.api.post(
            f"/api/public/{self.workspace.slug}/bookings/", payload,
        )


class WorkspaceGateTests(PublicBookingTestCase):
    def test_disabled_workspace_hides_every_public_endpoint(self):
        self.workspace.public_booking_enabled = False
        self.workspace.save(update_fields=["public_booking_enabled"])

        self.assertEqual(
            self.api.get(f"/api/public/{self.workspace.slug}/").status_code,
            404,
        )
        self.assertEqual(
            self.api.get(
                f"/api/public/{self.workspace.slug}/availability/",
                {"service": self.service.id, "date": MONDAY},
            ).status_code,
            404,
        )
        self.assertEqual(self._book().status_code, 404)

    def test_unknown_slug_is_404(self):
        res = self.api.get("/api/public/does-not-exist/")
        self.assertEqual(res.status_code, 404)


class PublicWorkspaceViewTests(PublicBookingTestCase):
    def test_returns_branding_and_active_services_only(self):
        Service.objects.create(
            workspace=self.workspace, name="Old Service",
            duration_minutes=30, is_active=False,
        )
        res = self.api.get(f"/api/public/{self.workspace.slug}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["workspace"]["slug"], self.workspace.slug)
        self.assertNotIn("stripe_connected", res.data["workspace"])
        self.assertNotIn("client_count", res.data["workspace"])
        service_names = [s["name"] for s in res.data["services"]]
        self.assertEqual(service_names, ["Haircut"])


class PublicAvailabilityViewTests(PublicBookingTestCase):
    def test_returns_the_same_slots_the_authenticated_view_would(self):
        res = self.api.get(
            f"/api/public/{self.workspace.slug}/availability/",
            {"service": self.service.id, "date": MONDAY},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["slots"], ["09:00", "10:00", "11:00"])

    def test_missing_params_is_a_400(self):
        res = self.api.get(
            f"/api/public/{self.workspace.slug}/availability/",
            {"date": MONDAY},
        )
        self.assertEqual(res.status_code, 400)

    def test_a_holiday_removes_every_slot_that_day(self):
        BlockedTime.objects.create(
            workspace=self.workspace,
            start_time=f"{MONDAY}T00:00:00Z",
            end_time="2027-06-08T00:00:00Z",
        )
        res = self.api.get(
            f"/api/public/{self.workspace.slug}/availability/",
            {"service": self.service.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], [])


class PublicBookingCreateViewTests(PublicBookingTestCase):
    def test_a_guest_can_book_without_an_account(self):
        res = self._book()
        self.assertEqual(res.status_code, 201, res.data)
        booking = Booking.objects.get(pk=res.data["id"])
        self.assertEqual(booking.workspace_id, self.workspace.id)
        self.assertEqual(booking.client.contact_email, "jamie@example.com")
        self.assertEqual(booking.client.company_name, "Jamie Guest")
        self.assertIsNone(booking.client.user)

    def test_a_repeat_guest_reuses_the_same_client_record(self):
        self._book()
        self._book(start_time=f"{MONDAY}T10:00:00Z")
        self.assertEqual(
            Client.objects.filter(
                workspace=self.workspace, contact_email="jamie@example.com",
            ).count(),
            1,
        )
        self.assertEqual(Booking.objects.count(), 2)

    def test_a_service_from_another_workspace_is_rejected(self):
        other_owner = User.objects.create_user(
            username="other", email="other@example.com",
            password="pw12345678", role="owner",
        )
        other_workspace = Workspace.objects.create(
            owner=other_owner, name="Other", public_booking_enabled=True,
        )
        other_service = Service.objects.create(
            workspace=other_workspace, name="Massage", duration_minutes=60,
        )
        res = self._book(service=other_service.id)
        self.assertEqual(res.status_code, 400)

    def test_booking_creation_is_rejected_inside_a_blocked_window(self):
        BlockedTime.objects.create(
            workspace=self.workspace,
            start_time=f"{MONDAY}T09:00:00Z",
            end_time=f"{MONDAY}T10:00:00Z",
        )
        res = self._book()
        self.assertEqual(res.status_code, 400)

    def test_capacity_is_still_enforced(self):
        self.service.capacity = 1
        self.service.save(update_fields=["capacity"])
        self._book()
        res = self._book(client_email="someone.else@example.com")
        self.assertEqual(res.status_code, 400)

    def test_a_client_id_in_the_payload_is_ignored_not_trusted(self):
        existing_client = Client.objects.create(
            workspace=self.workspace,
            company_name="Existing Co",
            contact_email="existing@example.com",
        )
        res = self._book(client=existing_client.id)
        self.assertEqual(res.status_code, 201, res.data)
        booking = Booking.objects.get(pk=res.data["id"])
        # client_email in the payload ("jamie@example.com") wins -
        # the read-only client field can't be used to attach the
        # booking to somebody else's existing client record.
        self.assertNotEqual(booking.client_id, existing_client.id)
