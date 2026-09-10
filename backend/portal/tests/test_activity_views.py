"""Read receipts for documents and invoices (ACT-02): the owner
should be able to tell whether a client actually opened something,
not just that it was uploaded or sent. Document reads are logged by
DocumentViewSet.file_view, the only endpoint that ever serves a
document's actual bytes (SEC-03) - so it needs a real uploaded file
to open, not the bare model-create-with-a-fake-path shortcut used
elsewhere.
"""
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from portal.models import (
    Activity, Client, Document, Invoice, InvoiceItem, Project, User,
    Workspace,
)
from portal.tests.helpers import auth_client

LOCAL_STORAGE = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}


class ActivityViewTestCase(TestCase):
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


@override_settings(STORAGES=LOCAL_STORAGE)
class DocumentViewedTests(ActivityViewTestCase):
    def setUp(self):
        super().setUp()
        upload = SimpleUploadedFile(
            "brief.pdf", b"%PDF-1.4 fake", content_type="application/pdf"
        )
        self.document = Document.objects.create(
            project=self.project, original_name="brief.pdf", file=upload,
        )

    def tearDown(self):
        self.document.file.delete(save=False)

    def test_client_opening_a_document_logs_an_activity(self):
        res = auth_client(self.client_user).get(
            f"/api/documents/{self.document.id}/file/"
        )
        self.assertEqual(res.status_code, 200)
        entry = Activity.objects.get(verb="document_viewed")
        self.assertEqual(entry.client_id, self.client_profile.id)
        self.assertEqual(entry.target_id, self.document.id)

    def test_owner_viewing_their_own_document_logs_nothing(self):
        res = auth_client(self.owner).get(
            f"/api/documents/{self.document.id}/file/"
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(
            Activity.objects.filter(verb="document_viewed").exists()
        )

    def test_client_cannot_reach_a_private_document_by_id(self):
        self.document.is_private = True
        self.document.save(update_fields=["is_private"])
        res = auth_client(self.client_user).get(
            f"/api/documents/{self.document.id}/file/"
        )
        self.assertEqual(res.status_code, 404)


class InvoiceViewedTests(ActivityViewTestCase):
    def setUp(self):
        super().setUp()
        self.invoice = Invoice.objects.create(
            workspace=self.workspace, client=self.client_profile, number="A"
        )
        InvoiceItem.objects.create(
            invoice=self.invoice, description="Work", amount=Decimal("100")
        )

    def test_client_downloading_pdf_logs_an_activity(self):
        res = auth_client(self.client_user).get(
            f"/api/invoices/{self.invoice.id}/pdf/"
        )
        self.assertEqual(res.status_code, 200)
        entry = Activity.objects.get(verb="invoice_viewed")
        self.assertEqual(entry.client_id, self.client_profile.id)
        self.assertEqual(entry.target_id, self.invoice.id)

    def test_owner_downloading_pdf_logs_nothing(self):
        res = auth_client(self.owner).get(
            f"/api/invoices/{self.invoice.id}/pdf/"
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(
            Activity.objects.filter(verb="invoice_viewed").exists()
        )
