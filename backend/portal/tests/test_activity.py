"""Activity audit-trail: the important invariant here isn't that
logging happens (that's obvious from reading the view), it's that
the *scoping* is right - one client must never see another client's
events, and workspace-internal events must never reach a client at
all. Getting this wrong is a real cross-tenant data leak, so it's
worth a real test rather than trusting the code by inspection.
"""
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.test import TestCase

from portal.activity import log as log_activity
from portal.models import Client, User, Workspace


def auth_client(user):
    api = APIClient()
    token = RefreshToken.for_user(user)
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return api


class ActivityScopingTests(TestCase):
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

    def test_creating_a_project_logs_activity_scoped_to_its_client(self):
        res = auth_client(self.owner).post(
            "/api/projects/",
            {"client": self.client_a.id, "name": "Website redesign"},
        )
        self.assertEqual(res.status_code, 201, res.data)

        owner_feed = auth_client(self.owner).get("/api/activities/")
        self.assertEqual(len(owner_feed.data), 1)
        self.assertEqual(owner_feed.data[0]["verb"], "project_created")

        a_feed = auth_client(self.client_user_a).get("/api/activities/")
        self.assertEqual(len(a_feed.data), 1)

        b_feed = auth_client(self.client_user_b).get("/api/activities/")
        self.assertEqual(
            len(b_feed.data),
            0,
            "Client B must not see Client A's project activity.",
        )

    def test_client_scoped_event_is_invisible_to_other_clients(self):
        log_activity(
            self.workspace,
            self.owner,
            "invoice_paid",
            self.client_a,
            client=self.client_a,
        )

        a_feed = auth_client(self.client_user_a).get("/api/activities/")
        self.assertEqual(len(a_feed.data), 1)

        b_feed = auth_client(self.client_user_b).get("/api/activities/")
        self.assertEqual(len(b_feed.data), 0)

    def test_workspace_internal_event_is_invisible_to_every_client(self):
        log_activity(self.workspace, self.owner, "team_invited", self.owner)

        owner_feed = auth_client(self.owner).get("/api/activities/")
        self.assertEqual(len(owner_feed.data), 1)

        for client_user in (self.client_user_a, self.client_user_b):
            feed = auth_client(client_user).get("/api/activities/")
            self.assertEqual(
                len(feed.data),
                0,
                "Workspace-internal events must never reach a client.",
            )

    def test_owner_can_filter_feed_by_client(self):
        log_activity(
            self.workspace,
            self.owner,
            "invoice_paid",
            self.client_a,
            client=self.client_a,
        )
        log_activity(
            self.workspace,
            self.owner,
            "invoice_paid",
            self.client_b,
            client=self.client_b,
        )

        res = auth_client(self.owner).get(
            f"/api/activities/?client={self.client_a.id}"
        )
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["client"], self.client_a.id)

    def test_another_workspace_never_sees_these_events(self):
        other_owner = User.objects.create_user(
            username="otherowner",
            email="otherowner@example.com",
            password="pw12345678",
            role="owner",
        )
        Workspace.objects.create(owner=other_owner, name="Other Co")
        log_activity(
            self.workspace,
            self.owner,
            "invoice_paid",
            self.client_a,
            client=self.client_a,
        )

        res = auth_client(other_owner).get("/api/activities/")
        self.assertEqual(len(res.data), 0)
