"""TEAM-02: role-based permissions. Restricting a staff member is
opt-in and per-person (User.restricted, off by default) - an owner
toggles it via PATCH /api/team/<id>/. Off (the default, and every
existing workspace's current state) changes nothing: a staff member
still sees the whole workspace, exactly as covered by
test_team_assignment.py. This file covers the other side: what
changes once a staff member IS restricted.
"""
from django.test import TestCase

from portal.models import (
    Booking, Client, Document, Invoice, Project, Service, User, Workspace,
)
from portal.tests.helpers import auth_client


class RestrictedStaffTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com",
            password="pw12345678", role="owner",
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner, name="Acme"
        )
        self.staff = User.objects.create_user(
            username="staff", email="staff@example.com",
            password="pw12345678", role="staff",
            staff_workspace=self.workspace,
        )
        self.assigned_client = Client.objects.create(
            workspace=self.workspace,
            company_name="Assigned Co",
            contact_email="assigned@example.com",
        )
        self.assigned_client.assigned_staff.add(self.staff)
        self.unassigned_client = Client.objects.create(
            workspace=self.workspace,
            company_name="Unassigned Co",
            contact_email="unassigned@example.com",
        )


class DefaultUnrestrictedTests(RestrictedStaffTestCase):
    def test_unrestricted_staff_still_sees_the_whole_workspace(self):
        res = auth_client(self.staff).get("/api/clients/")
        names = [c["company_name"] for c in res.data]
        self.assertIn("Assigned Co", names)
        self.assertIn("Unassigned Co", names)

    def test_restricted_defaults_to_false(self):
        self.assertFalse(self.staff.restricted)


class RestrictedFlagApiTests(RestrictedStaffTestCase):
    def test_owner_can_restrict_a_team_member(self):
        res = auth_client(self.owner).patch(
            f"/api/team/{self.staff.id}/", {"restricted": True}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.restricted)

    def test_staff_cannot_restrict_themselves(self):
        res = auth_client(self.staff).patch(
            f"/api/team/{self.staff.id}/", {"restricted": True}
        )
        self.assertEqual(res.status_code, 403)


class RestrictedClientScopingTests(RestrictedStaffTestCase):
    def setUp(self):
        super().setUp()
        self.staff.restricted = True
        self.staff.save()

    def test_restricted_staff_only_sees_assigned_clients(self):
        res = auth_client(self.staff).get("/api/clients/")
        self.assertEqual(
            [c["company_name"] for c in res.data], ["Assigned Co"]
        )

    def test_restricted_staff_cannot_fetch_an_unassigned_client_by_id(self):
        res = auth_client(self.staff).get(
            f"/api/clients/{self.unassigned_client.id}/"
        )
        self.assertEqual(res.status_code, 404)

    def test_owner_still_sees_every_client(self):
        res = auth_client(self.owner).get("/api/clients/")
        self.assertEqual(len(res.data), 2)


class RestrictedProjectDocumentInvoiceTests(RestrictedStaffTestCase):
    def setUp(self):
        super().setUp()
        self.staff.restricted = True
        self.staff.save()
        self.assigned_project = Project.objects.create(
            workspace=self.workspace, client=self.assigned_client,
            name="Assigned project",
        )
        self.unassigned_project = Project.objects.create(
            workspace=self.workspace, client=self.unassigned_client,
            name="Unassigned project",
        )
        Invoice.objects.create(
            workspace=self.workspace, client=self.assigned_client,
            number="INV-1", issued_at="2027-01-01",
        )
        Invoice.objects.create(
            workspace=self.workspace, client=self.unassigned_client,
            number="INV-2", issued_at="2027-01-01",
        )

    def test_restricted_staff_only_sees_projects_for_assigned_clients(self):
        res = auth_client(self.staff).get("/api/projects/")
        self.assertEqual(
            [p["name"] for p in res.data], ["Assigned project"]
        )

    def test_restricted_staff_only_sees_invoices_for_assigned_clients(self):
        res = auth_client(self.staff).get("/api/invoices/")
        self.assertEqual([i["number"] for i in res.data], ["INV-1"])

    def test_restricted_staff_cannot_fetch_a_document_from_the_unassigned_project(
        self,
    ):
        document = Document.objects.create(
            project=self.unassigned_project,
            file="workspaces/1/projects/1/doc.txt",
            original_name="doc.txt",
        )
        res = auth_client(self.staff).get(f"/api/documents/{document.id}/")
        self.assertEqual(res.status_code, 404)


class RestrictedBookingTests(RestrictedStaffTestCase):
    def setUp(self):
        super().setUp()
        self.staff.restricted = True
        self.staff.save()
        self.other_staff = User.objects.create_user(
            username="other_staff", email="other_staff@example.com",
            password="pw12345678", role="staff",
            staff_workspace=self.workspace,
        )
        self.service = Service.objects.create(
            workspace=self.workspace, name="Consult", duration_minutes=30,
        )
        self.assigned_client_booking = Booking.objects.create(
            workspace=self.workspace, service=self.service,
            client=self.assigned_client, staff=self.other_staff,
            start_time="2027-06-01T10:00:00Z",
            end_time="2027-06-01T10:30:00Z",
        )
        self.handled_by_me_booking = Booking.objects.create(
            workspace=self.workspace, service=self.service,
            client=self.unassigned_client, staff=self.staff,
            start_time="2027-06-02T10:00:00Z",
            end_time="2027-06-02T10:30:00Z",
        )
        self.unrelated_booking = Booking.objects.create(
            workspace=self.workspace, service=self.service,
            client=self.unassigned_client, staff=self.other_staff,
            start_time="2027-06-03T10:00:00Z",
            end_time="2027-06-03T10:30:00Z",
        )

    def test_restricted_staff_sees_bookings_for_assigned_clients_and_their_own(
        self,
    ):
        res = auth_client(self.staff).get("/api/bookings/")
        ids = {b["id"] for b in res.data}
        self.assertEqual(
            ids, {self.assigned_client_booking.id, self.handled_by_me_booking.id}
        )
        self.assertNotIn(self.unrelated_booking.id, ids)
