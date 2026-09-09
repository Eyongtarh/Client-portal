"""Email-notification side effects on top of existing flows
(MSG-03, INV-03, PAY-02). Each test checks the right person is the
recipient - the actual message wording isn't the risk here, who it
goes to is (a client's message must never email another client, an
invoice-sent email must reach the client not the owner, etc).
"""
from decimal import Decimal

from django.core import mail
from django.test import TestCase

from portal.models import Client, Invoice, InvoiceItem, Project, User, Workspace
from portal.tests.helpers import auth_client


class NotificationTestCase(TestCase):
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
            workspace=self.workspace, client=self.client_profile, name="Work"
        )


class MessageEmailTests(NotificationTestCase):
    def test_client_message_emails_the_owner(self):
        mail.outbox = []
        res = auth_client(self.client_user).post(
            "/api/messages/",
            {"project": self.project.id, "body": "Question about scope"},
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("owner@example.com", mail.outbox[0].to)

    def test_owner_message_emails_the_client(self):
        mail.outbox = []
        res = auth_client(self.owner).post(
            "/api/messages/",
            {"project": self.project.id, "body": "Update on progress"},
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("client@example.com", mail.outbox[0].to)


class InvoiceEmailTests(NotificationTestCase):
    def _invoice(self):
        invoice = Invoice.objects.create(
            workspace=self.workspace, client=self.client_profile, number="A"
        )
        InvoiceItem.objects.create(
            invoice=invoice, description="Work", amount=Decimal("100.00")
        )
        return invoice

    def test_marking_invoice_sent_emails_the_client(self):
        invoice = self._invoice()
        mail.outbox = []
        res = auth_client(self.owner).patch(
            f"/api/invoices/{invoice.id}/", {"status": "sent"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("client@example.com", mail.outbox[0].to)

    def test_marking_invoice_paid_emails_the_owner(self):
        invoice = self._invoice()
        invoice.status = "sent"
        invoice.save()
        mail.outbox = []
        res = auth_client(self.owner).patch(
            f"/api/invoices/{invoice.id}/", {"status": "paid"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("owner@example.com", mail.outbox[0].to)

    def test_no_status_change_sends_no_email(self):
        invoice = self._invoice()
        mail.outbox = []
        res = auth_client(self.owner).patch(
            f"/api/invoices/{invoice.id}/", {"due_at": "2026-12-01"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(mail.outbox), 0)
