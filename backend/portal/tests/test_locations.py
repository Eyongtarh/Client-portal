"""BOOK-06: a first-class Location entity. Service.location and
Resource.location (free text) keep working exactly as before for
anyone who hasn't switched to a structured Location - location_ref
is purely additive and only changes behavior once something is
actually linked to one.
"""
from datetime import time

from django.test import TestCase

from portal.models import (
    BlockedTime, Client, Location, Resource, Service, User, Workspace,
    WorkingHours,
)
from portal.tests.helpers import auth_client

MONDAY = "2027-06-07"


class LocationTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com",
            password="pw12345678", role="owner",
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner, name="Acme"
        )
        self.client_user = User.objects.create_user(
            username="client", email="client@example.com",
            password="pw12345678", role="client",
        )
        self.client_profile = Client.objects.create(
            workspace=self.workspace,
            user=self.client_user,
            company_name="Client Co",
            contact_email="client@example.com",
        )
        self.location = Location.objects.create(
            workspace=self.workspace, name="Downtown Studio",
            address="123 Main St",
        )


class LocationCrudApiTests(LocationTestCase):
    def test_owner_can_create_a_location(self):
        res = auth_client(self.owner).post(
            "/api/locations/",
            {"name": "Uptown Branch", "address": "456 Oak Ave"},
        )
        self.assertEqual(res.status_code, 201, res.data)

    def test_client_gets_read_only_access(self):
        res = auth_client(self.client_user).get("/api/locations/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_inactive_locations_are_hidden_from_clients(self):
        Location.objects.create(
            workspace=self.workspace, name="Closed branch", is_active=False,
        )
        res = auth_client(self.client_user).get("/api/locations/")
        names = [loc["name"] for loc in res.data]
        self.assertEqual(names, ["Downtown Studio"])

    def test_owner_still_sees_inactive_locations(self):
        Location.objects.create(
            workspace=self.workspace, name="Closed branch", is_active=False,
        )
        res = auth_client(self.owner).get("/api/locations/")
        self.assertEqual(len(res.data), 2)


class ServiceLocationTests(LocationTestCase):
    def test_service_can_link_to_a_location(self):
        res = auth_client(self.owner).post(
            "/api/services/",
            {
                "name": "Haircut", "duration_minutes": 30,
                "location_ref": self.location.id,
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["location_name"], "Downtown Studio")

    def test_cannot_link_a_service_to_another_workspaces_location(self):
        other_owner = User.objects.create_user(
            username="other", email="other@example.com",
            password="pw12345678", role="owner",
        )
        other_workspace = Workspace.objects.create(
            owner=other_owner, name="Other Co"
        )
        foreign_location = Location.objects.create(
            workspace=other_workspace, name="Foreign HQ"
        )
        res = auth_client(self.owner).post(
            "/api/services/",
            {
                "name": "Haircut", "duration_minutes": 30,
                "location_ref": foreign_location.id,
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_free_text_location_still_works_unlinked(self):
        res = auth_client(self.owner).post(
            "/api/services/",
            {
                "name": "Haircut", "duration_minutes": 30,
                "location": "Somewhere downtown",
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["location"], "Somewhere downtown")
        self.assertIsNone(res.data["location_ref"])


class ResourceLocationTests(LocationTestCase):
    def test_resource_can_link_to_a_location(self):
        res = auth_client(self.owner).post(
            "/api/resources/",
            {
                "name": "Room A", "duration_minutes": 60,
                "location_ref": self.location.id,
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["location_name"], "Downtown Studio")


class LocationWorkingHoursFallbackTests(LocationTestCase):
    def setUp(self):
        super().setUp()
        self.service = Service.objects.create(
            workspace=self.workspace, name="Consult", duration_minutes=60,
            location_ref=self.location,
        )
        # Workspace-wide default hours: 09:00-12:00.
        WorkingHours.objects.create(
            workspace=self.workspace, weekday=0,
            start_time=time(9, 0), end_time=time(12, 0),
        )

    def test_falls_back_to_workspace_default_with_no_location_hours(self):
        res = auth_client(self.owner).get(
            "/api/availability/", {"service": self.service.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"][0], "09:00")

    def test_location_hours_override_the_workspace_default(self):
        WorkingHours.objects.create(
            workspace=self.workspace, weekday=0, location=self.location,
            start_time=time(14, 0), end_time=time(16, 0),
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"service": self.service.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], ["14:00", "15:00"])

    def test_a_service_with_no_location_ignores_location_hours(self):
        WorkingHours.objects.create(
            workspace=self.workspace, weekday=0, location=self.location,
            start_time=time(14, 0), end_time=time(16, 0),
        )
        plain_service = Service.objects.create(
            workspace=self.workspace, name="Plain", duration_minutes=60,
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"service": plain_service.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], ["09:00", "10:00", "11:00"])


class LocationBlockedTimeTests(LocationTestCase):
    def setUp(self):
        super().setUp()
        self.service = Service.objects.create(
            workspace=self.workspace, name="Consult", duration_minutes=60,
            location_ref=self.location,
        )
        WorkingHours.objects.create(
            workspace=self.workspace, weekday=0,
            start_time=time(9, 0), end_time=time(12, 0),
        )

    def test_a_location_block_removes_every_slot_for_its_services(self):
        BlockedTime.objects.create(
            workspace=self.workspace, location=self.location,
            start_time=f"{MONDAY}T00:00:00Z",
            end_time="2027-06-08T00:00:00Z",
            reason="Closed for renovation",
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"service": self.service.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], [])

    def test_a_location_block_never_affects_a_different_locations_service(
        self,
    ):
        other_location = Location.objects.create(
            workspace=self.workspace, name="Other Branch",
        )
        other_service = Service.objects.create(
            workspace=self.workspace, name="Other consult",
            duration_minutes=60, location_ref=other_location,
        )
        BlockedTime.objects.create(
            workspace=self.workspace, location=self.location,
            start_time=f"{MONDAY}T00:00:00Z",
            end_time="2027-06-08T00:00:00Z",
        )
        res = auth_client(self.owner).get(
            "/api/availability/",
            {"service": other_service.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], ["09:00", "10:00", "11:00"])

    def test_a_resource_block_never_leaks_into_service_availability(self):
        """Regression: adding `resource` to BlockedTime this session
        must not make a resource-specific block also hide an
        unrelated service's slots."""
        resource = Resource.objects.create(
            workspace=self.workspace, name="Camera", duration_minutes=60,
        )
        BlockedTime.objects.create(
            workspace=self.workspace, resource=resource,
            start_time=f"{MONDAY}T00:00:00Z",
            end_time="2027-06-08T00:00:00Z",
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"service": self.service.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], ["09:00", "10:00", "11:00"])

    def test_booking_creation_is_rejected_inside_a_location_block(self):
        BlockedTime.objects.create(
            workspace=self.workspace, location=self.location,
            start_time=f"{MONDAY}T10:00:00Z",
            end_time=f"{MONDAY}T11:00:00Z",
        )
        res = auth_client(self.owner).post(
            "/api/bookings/",
            {
                "service": self.service.id,
                "client": self.client_profile.id,
                "start_time": f"{MONDAY}T10:00:00Z",
            },
        )
        self.assertEqual(res.status_code, 400)


class PublicBookingLocationTests(LocationTestCase):
    def setUp(self):
        super().setUp()
        self.workspace.public_booking_enabled = True
        self.workspace.save()
        self.other_location = Location.objects.create(
            workspace=self.workspace, name="Other Branch",
        )
        Service.objects.create(
            workspace=self.workspace, name="At downtown",
            duration_minutes=30, location_ref=self.location,
        )
        Service.objects.create(
            workspace=self.workspace, name="At other branch",
            duration_minutes=30, location_ref=self.other_location,
        )

    def test_public_workspace_view_lists_locations_and_all_services(self):
        res = self.client.get(f"/api/public/{self.workspace.slug}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["locations"]), 2)
        self.assertEqual(len(res.json()["services"]), 2)

    def test_location_query_param_narrows_services(self):
        res = self.client.get(
            f"/api/public/{self.workspace.slug}/?location={self.location.id}"
        )
        names = [s["name"] for s in res.json()["services"]]
        self.assertEqual(names, ["At downtown"])
