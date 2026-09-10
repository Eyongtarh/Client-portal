"""SEARCH-01..04: a workspace-wide search endpoint plus filtering
on the existing project/invoice/booking list endpoints. The
interesting risk here is the same as everywhere else in this app -
a workspace boundary that quietly doesn't hold - so half of these
tests are really about proving search never returns another
workspace's data just because a term happens to match.
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from portal.models import (
    Booking, Client, Invoice, InvoiceItem, Project, Service, User, Workspace,
)
from portal.tests.helpers import auth_client


class SearchTestCase(TestCase):
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
            company_name="Widget Corp",
            contact_email="client@example.com",
        )


class SearchViewTests(SearchTestCase):
    def test_finds_client_by_company_name(self):
        res = auth_client(self.owner).get("/api/search/?q=Widget")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            [c["company_name"] for c in res.data["clients"]], ["Widget Corp"]
        )

    def test_finds_project_by_name(self):
        Project.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            name="Rebrand launch",
        )
        res = auth_client(self.owner).get("/api/search/?q=rebrand")
        self.assertEqual(
            [p["name"] for p in res.data["projects"]], ["Rebrand launch"]
        )

    def test_finds_invoice_by_number(self):
        Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="INV-2026-04",
        )
        res = auth_client(self.owner).get("/api/search/?q=2026-04")
        self.assertEqual(
            [i["number"] for i in res.data["invoices"]], ["INV-2026-04"]
        )

    def test_short_query_returns_empty_groups_not_everything(self):
        res = auth_client(self.owner).get("/api/search/?q=a")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["clients"], [])

    def test_client_role_cannot_use_search(self):
        res = auth_client(self.client_user).get("/api/search/?q=Widget")
        self.assertEqual(res.status_code, 403)

    def test_search_never_crosses_workspace_boundary(self):
        other_owner = User.objects.create_user(
            username="otherowner",
            email="otherowner@example.com",
            password="pw12345678",
            role="owner",
        )
        other_ws = Workspace.objects.create(owner=other_owner, name="Other")
        Client.objects.create(
            workspace=other_ws,
            company_name="Widget Corp Rival",
            contact_email="rival@example.com",
        )
        res = auth_client(self.owner).get("/api/search/?q=Widget")
        names = [c["company_name"] for c in res.data["clients"]]
        self.assertNotIn("Widget Corp Rival", names)


class ProjectStatusFilterTests(SearchTestCase):
    def test_filters_projects_by_status(self):
        Project.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            name="Active one",
            status="active",
        )
        Project.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            name="Done one",
            status="completed",
        )
        res = auth_client(self.owner).get("/api/projects/?status=completed")
        self.assertEqual([p["name"] for p in res.data], ["Done one"])

    def test_filters_projects_by_deadline_range(self):
        Project.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            name="Due soon",
            deadline="2026-01-15",
        )
        Project.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            name="Due later",
            deadline="2026-03-01",
        )
        res = auth_client(self.owner).get(
            "/api/projects/?deadline_after=2026-02-01"
        )
        self.assertEqual([p["name"] for p in res.data], ["Due later"])

        res = auth_client(self.owner).get(
            "/api/projects/?deadline_before=2026-02-01"
        )
        self.assertEqual([p["name"] for p in res.data], ["Due soon"])

    def test_malformed_deadline_is_ignored_not_500(self):
        Project.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            name="Only one",
        )
        res = auth_client(self.owner).get(
            "/api/projects/?deadline_after=not-a-date"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)


class InvoiceFilterTests(SearchTestCase):
    def test_filters_invoices_by_status_and_due_date(self):
        Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="A",
            status="sent",
            due_at="2026-01-15",
        )
        Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="B",
            status="paid",
            due_at="2026-03-01",
        )
        res = auth_client(self.owner).get("/api/invoices/?status=sent")
        self.assertEqual([i["number"] for i in res.data], ["A"])

        res = auth_client(self.owner).get(
            "/api/invoices/?due_after=2026-02-01"
        )
        self.assertEqual([i["number"] for i in res.data], ["B"])

    def test_malformed_date_is_ignored_not_500(self):
        Invoice.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            number="A",
        )
        res = auth_client(self.owner).get(
            "/api/invoices/?due_after=not-a-date"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)


class BookingFilterTests(SearchTestCase):
    def setUp(self):
        super().setUp()
        self.service_a = Service.objects.create(
            workspace=self.workspace, name="Haircut", duration_minutes=30
        )
        self.service_b = Service.objects.create(
            workspace=self.workspace, name="Massage", duration_minutes=60
        )

    def test_filters_bookings_by_service_and_date(self):
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service_a,
            client=self.client_profile,
            start_time=timezone.now() + timezone.timedelta(days=1),
            end_time=timezone.now() + timezone.timedelta(days=1, minutes=30),
        )
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service_b,
            client=self.client_profile,
            start_time=timezone.now() + timezone.timedelta(days=2),
            end_time=timezone.now() + timezone.timedelta(days=2, minutes=60),
        )
        res = auth_client(self.owner).get(
            f"/api/bookings/?service={self.service_a.id}"
        )
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["service_name"], "Haircut")

    def test_filters_bookings_by_status(self):
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service_a,
            client=self.client_profile,
            start_time=timezone.now() + timezone.timedelta(days=1),
            end_time=timezone.now() + timezone.timedelta(days=1, minutes=30),
            status="cancelled",
        )
        res = auth_client(self.owner).get("/api/bookings/?status=cancelled")
        self.assertEqual(len(res.data), 1)
        res = auth_client(self.owner).get("/api/bookings/?status=confirmed")
        self.assertEqual(len(res.data), 0)
