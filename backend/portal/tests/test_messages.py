"""Message attachments (MSG-05). A message needs a body or an
attachment - never neither, since an empty message is not
communication - but either one alone is enough.
"""
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from portal.models import Client, Message, Project, User, Workspace
from portal.tests.helpers import auth_client

LOCAL_STORAGE = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}


class MessageTestCase(TestCase):
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
        self.project = Project.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            name="Website",
        )


class MessageValidationTests(MessageTestCase):
    def test_body_only_message_still_works(self):
        res = auth_client(self.owner).post(
            "/api/messages/", {"project": self.project.id, "body": "Hi"}
        )
        self.assertEqual(res.status_code, 201, res.data)

    def test_message_needs_a_body_or_an_attachment(self):
        res = auth_client(self.owner).post(
            "/api/messages/", {"project": self.project.id, "body": ""}
        )
        self.assertEqual(res.status_code, 400)


@override_settings(STORAGES=LOCAL_STORAGE)
class MessageAttachmentTests(MessageTestCase):
    def test_attachment_only_message_is_allowed(self):
        upload = SimpleUploadedFile(
            "brief.pdf", b"%PDF-1.4 fake", content_type="application/pdf"
        )
        res = auth_client(self.client_user).post(
            "/api/messages/",
            {"project": self.project.id, "body": "", "attachment": upload},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.data)
        message = Message.objects.get(id=res.data["id"])
        self.assertEqual(message.attachment_name, "brief.pdf")
        self.assertGreater(message.attachment_size_bytes, 0)
        message.attachment.delete(save=False)

    def test_attachment_metadata_is_not_client_settable(self):
        upload = SimpleUploadedFile(
            "brief.pdf", b"%PDF-1.4 fake", content_type="application/pdf"
        )
        res = auth_client(self.owner).post(
            "/api/messages/",
            {
                "project": self.project.id,
                "body": "See attached",
                "attachment": upload,
                "attachment_name": "spoofed.exe",
                "attachment_size_bytes": 999,
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.data)
        message = Message.objects.get(id=res.data["id"])
        self.assertEqual(message.attachment_name, "brief.pdf")
        message.attachment.delete(save=False)
