"""Regression tests for a real bug: ProjectViewSet, TaskViewSet,
DocumentViewSet, MessageViewSet, InvoiceViewSet, and ApprovalViewSet
all silently ignored the ?client=/?project= query params the
frontend sends for owner/staff (get_queryset only ever scoped to
the whole workspace). In any workspace with more than one client,
this meant the client-detail page's tabs actually showed a mix of
every client's tasks/documents/messages/invoices/approvals, not
just the one client being viewed - confirmed live before the fix
via a two-client workspace where /api/projects/?client=<id>
returned both clients' projects.

Each test below sets up two clients/projects and checks the query
param actually narrows the result to just the right one.
"""
from decimal import Decimal

from django.test import TestCase

from portal.models import (
    Approval, Client, Document, Invoice, Message, Project, Task, User,
    Workspace,
)
from portal.tests.helpers import auth_client


class QueryParamScopingTests(TestCase):
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
        self.client_user_a = User.objects.create_user(
            username="clienta",
            email="clienta@example.com",
            password="pw12345678",
            role="client",
        )
        self.client_a = Client.objects.create(
            workspace=self.workspace,
            user=self.client_user_a,
            company_name="Client A",
            contact_email="clienta@example.com",
        )
        self.client_user_b = User.objects.create_user(
            username="clientb",
            email="clientb@example.com",
            password="pw12345678",
            role="client",
        )
        self.client_b = Client.objects.create(
            workspace=self.workspace,
            user=self.client_user_b,
            company_name="Client B",
            contact_email="clientb@example.com",
        )
        self.project_a = Project.objects.create(
            workspace=self.workspace, client=self.client_a, name="For A"
        )
        self.project_b = Project.objects.create(
            workspace=self.workspace, client=self.client_b, name="For B"
        )

    def test_projects_filtered_by_client(self):
        res = auth_client(self.owner).get(
            f"/api/projects/?client={self.client_a.id}"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual([p["id"] for p in res.data], [self.project_a.id])

    def test_projects_unfiltered_without_query_param(self):
        res = auth_client(self.owner).get("/api/projects/")
        self.assertEqual(len(res.data), 2)

    def test_projects_with_garbage_query_param_falls_back_unfiltered(self):
        res = auth_client(self.owner).get("/api/projects/?client=not-a-number")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

    def test_tasks_filtered_by_project(self):
        Task.objects.create(project=self.project_a, title="Task A")
        Task.objects.create(project=self.project_b, title="Task B")
        res = auth_client(self.owner).get(
            f"/api/tasks/?project={self.project_a.id}"
        )
        self.assertEqual([t["title"] for t in res.data], ["Task A"])

    def test_documents_filtered_by_project(self):
        Document.objects.create(
            project=self.project_a,
            original_name="a.pdf",
            file="workspaces/1/a.pdf",
        )
        Document.objects.create(
            project=self.project_b,
            original_name="b.pdf",
            file="workspaces/1/b.pdf",
        )
        res = auth_client(self.owner).get(
            f"/api/documents/?project={self.project_a.id}"
        )
        self.assertEqual(
            [d["original_name"] for d in res.data], ["a.pdf"]
        )

    def test_messages_filtered_by_project(self):
        Message.objects.create(
            project=self.project_a, sender=self.owner, body="Hi A"
        )
        Message.objects.create(
            project=self.project_b, sender=self.owner, body="Hi B"
        )
        res = auth_client(self.owner).get(
            f"/api/messages/?project={self.project_a.id}"
        )
        self.assertEqual([m["body"] for m in res.data], ["Hi A"])

    def test_approvals_filtered_by_project(self):
        Approval.objects.create(project=self.project_a, title="Approve A")
        Approval.objects.create(project=self.project_b, title="Approve B")
        res = auth_client(self.owner).get(
            f"/api/approvals/?project={self.project_a.id}"
        )
        self.assertEqual([a["title"] for a in res.data], ["Approve A"])

    def test_invoices_filtered_by_client(self):
        Invoice.objects.create(
            workspace=self.workspace, client=self.client_a, number="A-1"
        )
        Invoice.objects.create(
            workspace=self.workspace, client=self.client_b, number="B-1"
        )
        res = auth_client(self.owner).get(
            f"/api/invoices/?client={self.client_a.id}"
        )
        self.assertEqual([i["number"] for i in res.data], ["A-1"])

    def test_a_client_from_a_different_workspace_cannot_be_used_to_probe(self):
        other_owner = User.objects.create_user(
            username="otherowner",
            email="otherowner@example.com",
            password="pw12345678",
            role="owner",
        )
        other_ws = Workspace.objects.create(owner=other_owner, name="Other")
        other_client_user = User.objects.create_user(
            username="otherclient",
            email="otherclient@example.com",
            password="pw12345678",
            role="client",
        )
        other_client = Client.objects.create(
            workspace=other_ws,
            user=other_client_user,
            company_name="Other Client",
            contact_email="otherclient@example.com",
        )
        Project.objects.create(
            workspace=other_ws, client=other_client, name="Other project"
        )
        # This workspace's owner passes a client id that belongs to a
        # different workspace entirely - must never leak that
        # workspace's projects just because the id happens to exist.
        res = auth_client(self.owner).get(
            f"/api/projects/?client={other_client.id}"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 0)
