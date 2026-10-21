"""A client's legitimate writes are narrow: upload a document, send a
message, decide an approval, pay an invoice. Everything else on the
project scoped endpoints is read only for them, and a client may only
edit or remove what they themselves created.
"""
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from portal.models import (
    Client, Document, Message, Milestone, Project, Task, User, Workspace,
)
from portal.tests.helpers import auth_client


@override_settings(
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    }
)
class ClientWriteBoundaryTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="o@example.com",
            password="pw12345678", role="owner",
        )
        self.workspace = Workspace.objects.create(owner=self.owner, name="Acme")
        self.client_user = User.objects.create_user(
            username="client", email="c@example.com",
            password="pw12345678", role="client",
        )
        self.client_profile = Client.objects.create(
            workspace=self.workspace, user=self.client_user,
            company_name="Client Co", contact_email="c@example.com",
        )
        self.project = Project.objects.create(
            workspace=self.workspace, client=self.client_profile,
            name="Site", budget=Decimal("1000.00"),
        )
        self.milestone = Milestone.objects.create(
            project=self.project, title="Design"
        )
        self.task = Task.objects.create(project=self.project, title="Wire")
        self.api = auth_client(self.client_user)

    def test_client_cannot_edit_or_delete_a_project(self):
        res = self.api.patch(
            f"/api/projects/{self.project.id}/", {"budget": "1"}, format="json"
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(
            self.api.delete(f"/api/projects/{self.project.id}/").status_code, 403
        )
        self.project.refresh_from_db()
        self.assertEqual(self.project.budget, Decimal("1000.00"))

    def test_client_cannot_create_a_project(self):
        res = self.api.post(
            "/api/projects/",
            {"client": self.client_profile.id, "name": "Free work"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_change_milestones_or_tasks(self):
        self.assertEqual(
            self.api.patch(
                f"/api/milestones/{self.milestone.id}/",
                {"is_complete": True}, format="json",
            ).status_code, 403,
        )
        self.assertEqual(
            self.api.delete(f"/api/tasks/{self.task.id}/").status_code, 403
        )
        self.assertTrue(Task.objects.filter(pk=self.task.pk).exists())

    def test_client_can_still_read_project_tasks_and_milestones(self):
        self.assertEqual(self.api.get("/api/projects/").status_code, 200)
        self.assertEqual(self.api.get("/api/tasks/").status_code, 200)
        self.assertEqual(self.api.get("/api/milestones/").status_code, 200)

    def test_client_cannot_delete_or_edit_a_document_the_owner_uploaded(self):
        doc = Document.objects.create(
            project=self.project, uploaded_by=self.owner,
            original_name="deliverable.pdf",
            file=SimpleUploadedFile("deliverable.pdf", b"x"),
        )
        self.assertEqual(
            self.api.delete(f"/api/documents/{doc.id}/").status_code, 403
        )
        self.assertTrue(Document.objects.filter(pk=doc.pk).exists())

    def test_client_can_delete_their_own_upload(self):
        doc = Document.objects.create(
            project=self.project, uploaded_by=self.client_user,
            original_name="mine.pdf",
            file=SimpleUploadedFile("mine.pdf", b"x"),
        )
        self.assertEqual(
            self.api.delete(f"/api/documents/{doc.id}/").status_code, 204
        )

    def test_client_cannot_edit_or_delete_the_owners_message(self):
        msg = Message.objects.create(
            project=self.project, sender=self.owner, body="Quote attached"
        )
        self.assertEqual(
            self.api.patch(
                f"/api/messages/{msg.id}/", {"body": "forged"}, format="json"
            ).status_code, 403,
        )
        self.assertEqual(
            self.api.delete(f"/api/messages/{msg.id}/").status_code, 403
        )
        msg.refresh_from_db()
        self.assertEqual(msg.body, "Quote attached")

    def test_owner_keeps_full_write_access(self):
        owner_api = auth_client(self.owner)
        self.assertEqual(
            owner_api.patch(
                f"/api/projects/{self.project.id}/",
                {"name": "Renamed"}, format="json",
            ).status_code, 200,
        )
        self.assertEqual(
            owner_api.delete(f"/api/tasks/{self.task.id}/").status_code, 204
        )


class ClientConfigurationWriteTests(ClientWriteBoundaryTests):
    """Business configuration (services, resources, hours, blocks,
    locations) is read only for clients; an owner keeps full control.
    """

    def setUp(self):
        super().setUp()
        from portal.models import BlockedTime, Location, Resource, Service

        self.service = Service.objects.create(
            workspace=self.workspace, name="Cut", duration_minutes=30,
            price=Decimal("20.00"),
        )
        self.resource = Resource.objects.create(
            workspace=self.workspace, name="Room 1"
        )
        self.location = Location.objects.create(
            workspace=self.workspace, name="Main"
        )

    def test_client_cannot_edit_or_delete_services_resources_locations(self):
        for url in (
            f"/api/services/{self.service.id}/",
            f"/api/resources/{self.resource.id}/",
            f"/api/locations/{self.location.id}/",
        ):
            self.assertEqual(
                self.api.patch(url, {"name": "x"}, format="json").status_code,
                403, url,
            )
            self.assertEqual(self.api.delete(url).status_code, 403, url)

    def test_client_cannot_add_working_hours_or_block_time(self):
        self.assertEqual(
            self.api.post("/api/blocked-times/", {}, format="json").status_code,
            403,
        )
        self.assertEqual(
            self.api.post("/api/working-hours/", {}, format="json").status_code,
            403,
        )

    def test_client_can_still_browse_the_catalogue(self):
        for url in ("/api/services/", "/api/resources/", "/api/locations/"):
            self.assertEqual(self.api.get(url).status_code, 200, url)

    def test_resource_calendar_hides_other_clients_reservations(self):
        from django.utils import timezone

        from portal.models import Booking, ResourceReservation

        other_user = User.objects.create_user(
            username="other", email="x@example.com",
            password="pw12345678", role="client",
        )
        other = Client.objects.create(
            workspace=self.workspace, user=other_user,
            company_name="Rival Co", contact_email="x@example.com",
        )
        now = timezone.now()
        booking = Booking.objects.create(
            workspace=self.workspace, client=other, resource=self.resource,
            start_time=now, end_time=now + timezone.timedelta(hours=1),
        )
        ResourceReservation.objects.create(
            workspace=self.workspace, booking=booking, resource=self.resource,
        )
        res = self.api.get(f"/api/resources/{self.resource.id}/calendar/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), [])
        owner_res = auth_client(self.owner).get(
            f"/api/resources/{self.resource.id}/calendar/?from=garbage"
        )
        self.assertEqual(owner_res.status_code, 200)
        self.assertEqual(len(owner_res.json()), 1)
