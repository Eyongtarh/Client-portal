"""Regression tests for a workspace-isolation gap a security review
found: BookingSerializer's `service`/`resource`/`client` fields had
no workspace check for the authenticated flow (unlike `resource_ids`
and `staff`, which already validated this) - an owner/staff could
id-guess a service, resource, or client belonging to a completely
different workspace and either book across the tenant boundary or,
via RecurringSeriesCreateSerializer (which derives the series' own
workspace from `service.workspace`), write a whole recurring series
directly into someone else's workspace.
"""
from django.test import TestCase

from portal.models import (
    Client, RecurringSeries, Resource, Service, User, Workspace,
)
from portal.tests.helpers import auth_client

MONDAY = "2027-06-07T10:00:00Z"  # safely in the future


class CrossWorkspaceScopingTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com",
            password="pw12345678", role="owner",
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner, name="Acme"
        )
        self.client_profile = Client.objects.create(
            workspace=self.workspace, company_name="Own Client",
            contact_email="own-client@example.com",
        )

        self.other_owner = User.objects.create_user(
            username="other", email="other@example.com",
            password="pw12345678", role="owner",
        )
        self.other_workspace = Workspace.objects.create(
            owner=self.other_owner, name="Other Co"
        )
        self.other_service = Service.objects.create(
            workspace=self.other_workspace, name="Massage",
            duration_minutes=60,
        )
        self.other_resource = Resource.objects.create(
            workspace=self.other_workspace, name="Room",
            duration_minutes=60,
        )
        self.other_client = Client.objects.create(
            workspace=self.other_workspace, company_name="Their Client",
            contact_email="their-client@example.com",
        )


class BookingCrossWorkspaceTests(CrossWorkspaceScopingTestCase):
    def test_cannot_book_a_service_from_another_workspace(self):
        res = auth_client(self.owner).post(
            "/api/bookings/",
            {"service": self.other_service.id, "start_time": MONDAY},
        )
        self.assertEqual(res.status_code, 400)

    def test_cannot_book_a_resource_from_another_workspace(self):
        res = auth_client(self.owner).post(
            "/api/bookings/",
            {"resource": self.other_resource.id, "start_time": MONDAY},
        )
        self.assertEqual(res.status_code, 400)

    def test_cannot_create_a_booking_for_a_client_from_another_workspace(self):
        own_service = Service.objects.create(
            workspace=self.workspace, name="Haircut", duration_minutes=60,
        )
        res = auth_client(self.owner).post(
            "/api/bookings/",
            {
                "service": own_service.id,
                "client": self.other_client.id,
                "start_time": MONDAY,
            },
        )
        self.assertEqual(res.status_code, 400)


class RecurringSeriesCrossWorkspaceTests(CrossWorkspaceScopingTestCase):
    def test_cannot_create_a_recurring_series_from_another_workspaces_service(self):
        res = auth_client(self.owner).post(
            "/api/recurring-series/",
            {
                "service": self.other_service.id,
                "client": self.client_profile.id,
                "start_time": MONDAY,
                "occurrences": 3,
            },
        )
        self.assertEqual(res.status_code, 400)
        # Before the fix, this would have silently created the
        # series (and its bookings) inside other_workspace, since
        # create() derives workspace from service.workspace.
        self.assertFalse(
            RecurringSeries.objects.filter(
                workspace=self.other_workspace
            ).exists()
        )

    def test_cannot_create_a_recurring_series_for_another_workspaces_client(self):
        own_service = Service.objects.create(
            workspace=self.workspace, name="Haircut", duration_minutes=60,
        )
        res = auth_client(self.owner).post(
            "/api/recurring-series/",
            {
                "service": own_service.id,
                "client": self.other_client.id,
                "start_time": MONDAY,
                "occurrences": 3,
            },
        )
        self.assertEqual(res.status_code, 400)
