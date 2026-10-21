"""Writable foreign keys must never reach into another workspace, and a
client must not be able to rewrite who or what their own booking is
for. Each test names the exploit it closes.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from portal.models import (
    Booking, Client, Invoice, Message, Milestone, Project, RecurringSeries,
    Service, Task, User, WorkingHours, Workspace,
)
from portal.tests.helpers import auth_client


def make_workspace(tag):
    owner = User.objects.create_user(
        username=f"owner-{tag}", email=f"owner-{tag}@example.com",
        password="pw12345678", role="owner",
    )
    workspace = Workspace.objects.create(owner=owner, name=f"WS {tag}")
    client_user = User.objects.create_user(
        username=f"client-{tag}", email=f"client-{tag}@example.com",
        password="pw12345678", role="client",
    )
    client = Client.objects.create(
        workspace=workspace, user=client_user, company_name=f"Client {tag}",
        contact_email=f"client-{tag}@example.com",
    )
    project = Project.objects.create(
        workspace=workspace, client=client, name=f"Project {tag}",
        budget=Decimal("10.00"),
    )
    service = Service.objects.create(
        workspace=workspace, name=f"Service {tag}", duration_minutes=30,
        price=Decimal("10.00"),
    )
    return owner, workspace, client_user, client, project, service


class CrossTenantWriteTests(TestCase):
    def setUp(self):
        (self.owner_a, self.ws_a, self.cu_a, self.client_a,
         self.project_a, self.service_a) = make_workspace("a")
        (self.owner_b, self.ws_b, self.cu_b, self.client_b,
         self.project_b, self.service_b) = make_workspace("b")

    def test_client_cannot_post_a_message_into_another_workspaces_project(self):
        res = auth_client(self.cu_a).post(
            "/api/messages/",
            {"project": self.project_b.id, "body": "spam"}, format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Message.objects.filter(project=self.project_b).exists())

    def test_client_cannot_post_a_message_into_another_clients_project(self):
        other_user = User.objects.create_user(
            username="c2", email="c2@example.com",
            password="pw12345678", role="client",
        )
        other = Client.objects.create(
            workspace=self.ws_a, user=other_user, company_name="Other",
            contact_email="c2@example.com",
        )
        project = Project.objects.create(
            workspace=self.ws_a, client=other, name="Private",
        )
        res = auth_client(self.cu_a).post(
            "/api/messages/", {"project": project.id, "body": "hi"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_owner_cannot_create_task_milestone_or_approval_in_foreign_project(self):
        api = auth_client(self.owner_a)
        for url, body in (
            ("/api/tasks/", {"project": self.project_b.id, "title": "x"}),
            ("/api/milestones/", {"project": self.project_b.id, "title": "x"}),
            ("/api/approvals/", {"project": self.project_b.id, "title": "x"}),
        ):
            res = api.post(url, body, format="json")
            self.assertEqual(res.status_code, 400, url)
        self.assertFalse(Task.objects.filter(project=self.project_b).exists())

    def test_task_milestone_must_belong_to_the_same_project(self):
        milestone_b = Milestone.objects.create(
            project=self.project_b, title="B milestone"
        )
        res = auth_client(self.owner_a).post(
            "/api/tasks/",
            {"project": self.project_a.id, "milestone": milestone_b.id,
             "title": "x"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_owner_cannot_create_a_project_or_invoice_for_a_foreign_client(self):
        api = auth_client(self.owner_a)
        res = api.post(
            "/api/projects/",
            {"client": self.client_b.id, "name": "Hijack"}, format="json",
        )
        self.assertEqual(res.status_code, 400)
        res = api.post(
            "/api/invoices/",
            {"client": self.client_b.id, "number": "X-1", "items": []},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Invoice.objects.filter(client=self.client_b).exists())

    def test_invoice_project_must_belong_to_the_invoiced_client(self):
        res = auth_client(self.owner_a).post(
            "/api/invoices/",
            {"client": self.client_a.id, "project": self.project_b.id,
             "number": "X-2", "items": []},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_owner_cannot_move_a_project_to_a_foreign_client(self):
        res = auth_client(self.owner_a).patch(
            f"/api/projects/{self.project_a.id}/",
            {"client": self.client_b.id}, format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_client_cannot_upload_a_document_to_a_foreign_project(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        res = auth_client(self.cu_a).post(
            "/api/documents/",
            {"project": self.project_b.id,
             "file": SimpleUploadedFile("x.pdf", b"x")},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)

    def test_waitlist_service_must_be_in_the_callers_workspace(self):
        res = auth_client(self.cu_a).post(
            "/api/waitlist/",
            {"service": self.service_b.id,
             "start_time": (timezone.now() + timedelta(days=3)).isoformat()},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_resource_cannot_be_tied_to_a_foreign_service(self):
        res = auth_client(self.owner_a).post(
            "/api/resources/",
            {"name": "Room", "duration_minutes": 30,
             "services": [self.service_b.id]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_restricted_staff_cannot_write_to_unassigned_clients_project(self):
        staff = User.objects.create_user(
            username="staff", email="s@example.com", password="pw12345678",
            role="staff", staff_workspace=self.ws_a, restricted=True,
        )
        res = auth_client(staff).post(
            "/api/tasks/", {"project": self.project_a.id, "title": "x"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)


class ClientBookingTamperingTests(TestCase):
    def setUp(self):
        (self.owner, self.ws, self.cu, self.client_p,
         self.project, self.service) = make_workspace("a")
        other_user = User.objects.create_user(
            username="c2", email="c2@example.com",
            password="pw12345678", role="client",
        )
        self.other = Client.objects.create(
            workspace=self.ws, user=other_user, company_name="Other",
            contact_email="c2@example.com",
        )
        self.cheap = Service.objects.create(
            workspace=self.ws, name="Free", duration_minutes=30,
            price=Decimal("0.00"),
        )
        self.start = timezone.now() + timedelta(days=5)
        self.booking = Booking.objects.create(
            workspace=self.ws, client=self.client_p, service=self.service,
            start_time=self.start,
            end_time=self.start + timedelta(minutes=30),
        )
        self.api = auth_client(self.cu)

    def test_client_cannot_reassign_a_booking_to_another_client(self):
        res = self.api.patch(
            f"/api/bookings/{self.booking.id}/",
            {"client": self.other.id}, format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.client_id, self.client_p.id)

    def test_client_cannot_swap_their_booking_to_another_service(self):
        res = self.api.patch(
            f"/api/bookings/{self.booking.id}/",
            {"service": self.cheap.id}, format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_client_cannot_create_a_booking_already_marked_completed(self):
        WorkingHours.objects.create(
            workspace=self.ws, weekday=0, start_time="00:00", end_time="23:59"
        )
        res = self.api.post(
            "/api/bookings/",
            {"service": self.service.id,
             "start_time": (timezone.now() + timedelta(days=9)).isoformat(),
             "status": "completed"},
            format="json",
        )
        self.assertIn(res.status_code, (201, 400))
        if res.status_code == 201:
            self.assertEqual(res.json()["status"], "confirmed")

    def test_booking_cannot_be_attached_to_a_foreign_recurring_series(self):
        _, ws_b, _, client_b, _, service_b = make_workspace("b")
        series_b = RecurringSeries.objects.create(
            workspace=ws_b, service=service_b, client=client_b
        )
        res = self.api.patch(
            f"/api/bookings/{self.booking.id}/",
            {"series": series_b.id}, format="json",
        )
        self.booking.refresh_from_db()
        self.assertNotEqual(self.booking.series_id, series_b.id)

    def test_client_can_still_reschedule_and_cancel_their_own_booking(self):
        res = self.api.patch(
            f"/api/bookings/{self.booking.id}/",
            {"status": "cancelled"}, format="json",
        )
        self.assertEqual(res.status_code, 200)


class RobustnessTests(TestCase):
    """Inputs that used to end in a 500 or leak more than intended."""

    def setUp(self):
        (self.owner, self.ws, self.cu, self.client_p,
         self.project, self.service) = make_workspace("a")
        self.api = auth_client(self.owner)

    def test_duplicate_invoice_number_is_a_400_not_a_500(self):
        body = {"client": self.client_p.id, "number": "INV-1", "items": []}
        self.assertEqual(
            self.api.post("/api/invoices/", body, format="json").status_code, 201
        )
        self.assertEqual(
            self.api.post("/api/invoices/", body, format="json").status_code, 400
        )

    def test_public_page_does_not_leak_an_online_services_meeting_link(self):
        self.ws.public_booking_enabled = True
        self.ws.save()
        self.service.is_online = True
        self.service.meeting_link = "https://zoom.example/secret"
        self.service.save()
        res = auth_client(self.cu).__class__().get(
            f"/api/public/{self.ws.slug}/"
        )
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("zoom.example", res.content.decode())

    def test_guest_booked_client_can_still_accept_an_invite_later(self):
        from portal.models import ClientInvite
        from rest_framework.test import APIClient

        guest = Client.objects.create(
            workspace=self.ws, company_name="Guest",
            contact_email="guest@example.com",
        )
        invite = ClientInvite.objects.create(
            workspace=self.ws, email="guest@example.com", company_name="Guest Co",
        )
        res = APIClient().post(
            "/api/auth/accept-invite/",
            {"token": str(invite.token), "password": "Sturdy-pass-4321",
             "full_name": "Gus"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        guest.refresh_from_db()
        self.assertIsNotNone(guest.user_id)

    def test_deleting_a_resource_with_history_is_a_400(self):
        from portal.models import Resource, ResourceReservation

        resource = Resource.objects.create(workspace=self.ws, name="Room")
        start = timezone.now() + timedelta(days=2)
        booking = Booking.objects.create(
            workspace=self.ws, client=self.client_p, resource=resource,
            start_time=start, end_time=start + timedelta(hours=1),
        )
        ResourceReservation.objects.create(
            workspace=self.ws, booking=booking, resource=resource
        )
        res = self.api.delete(f"/api/resources/{resource.id}/")
        self.assertEqual(res.status_code, 400)

    def test_bad_workspace_timezone_and_availability_inputs_are_400s(self):
        self.assertEqual(
            self.api.patch(
                "/api/workspace/", {"timezone": "Mars/Base"}, format="json"
            ).status_code, 400,
        )
        for url in (
            "/api/availability/?service=abc&date=2030-01-01",
            f"/api/availability/?service={self.service.id}&date=garbage",
            "/api/availability/?resource=x&date=2030-01-01",
        ):
            self.assertEqual(self.api.get(url).status_code, 400, url)

    def test_ics_cannot_be_injected_through_notes(self):
        from portal.calendar_invite import build_ics

        start = timezone.now() + timedelta(days=2)
        booking = Booking.objects.create(
            workspace=self.ws, client=self.client_p, service=self.service,
            start_time=start, end_time=start + timedelta(minutes=30),
            notes="hi\rATTENDEE:mailto:evil@example.com",
        )
        ics = build_ics(booking)
        self.assertNotIn("\r\nATTENDEE", ics)
