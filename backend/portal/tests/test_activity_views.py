"""Read receipts for documents and invoices (ACT-02): the owner
should be able to tell whether a client actually opened something,
not just that it was uploaded or sent.
"""
from decimal import Decimal

from django.test import TestCase

from portal.models import (
    Activity, Client, Document, Invoice, InvoiceItem, Project, User,
    Workspace,
)
from portal.tests.helpers import auth_client


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


class DocumentViewedTests(ActivityViewTestCase):
    def setUp(self):
        super().setUp()
        self.document = Document.objects.create(
            project=self.project,
            original_name="brief.pdf",
            file="workspaces/1/brief.pdf",
        )

    def test_client_opening_a_document_logs_an_activity(self):
        res = auth_client(self.client_user).post(
            f"/api/documents/{self.document.id}/mark-viewed/"
        )
        self.assertEqual(res.status_code, 204)
        entry = Activity.objects.get(verb="document_viewed")
        self.assertEqual(entry.client_id, self.client_profile.id)
        self.assertEqual(entry.target_id, self.document.id)

    def test_owner_viewing_their_own_document_logs_nothing(self):
        res = auth_client(self.owner).post(
            f"/api/documents/{self.document.id}/mark-viewed/"
        )
        self.assertEqual(res.status_code, 204)
        self.assertFalse(
            Activity.objects.filter(verb="document_viewed").exists()
        )


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
