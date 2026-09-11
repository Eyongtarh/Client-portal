"""Notification bell (NOTIF-01/02): the same Activity audit trail
already used elsewhere, now with a per-viewer read/unread state and
a way to mute whole categories of it. New message activity logging
(the actual NOTIF-01 gap - messages never generated an Activity
entry at all) is covered here too.
"""
from django.test import TestCase

from portal.models import Activity, Client, Project, User, Workspace
from portal.tests.helpers import auth_client


class NotificationBellTestCase(TestCase):
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
            workspace=self.workspace, client=self.client_profile, name="Site",
        )

    def _activity(self, verb="project_created"):
        return Activity.objects.create(
            workspace=self.workspace,
            actor=self.owner,
            client=self.client_profile,
            verb=verb,
            target_type="project",
            target_id=self.project.id,
            target_repr="Site",
        )


class UnreadCountTests(NotificationBellTestCase):
    def test_new_activity_is_unread(self):
        self._activity()
        res = auth_client(self.owner).get("/api/activities/unread-count/")
        self.assertEqual(res.data["count"], 1)

    def test_marking_one_read_decrements_the_count(self):
        a1 = self._activity()
        self._activity()
        auth_client(self.owner).post(f"/api/activities/{a1.id}/mark-read/")
        res = auth_client(self.owner).get("/api/activities/unread-count/")
        self.assertEqual(res.data["count"], 1)

    def test_mark_all_read_zeroes_the_count(self):
        self._activity()
        self._activity(verb="task_completed")
        auth_client(self.owner).post("/api/activities/mark-all-read/")
        res = auth_client(self.owner).get("/api/activities/unread-count/")
        self.assertEqual(res.data["count"], 0)

    def test_read_state_is_per_user_not_global(self):
        a1 = self._activity()
        auth_client(self.owner).post(f"/api/activities/{a1.id}/mark-read/")
        res = auth_client(self.client_user).get("/api/activities/unread-count/")
        self.assertEqual(res.data["count"], 1)

    def test_muting_a_category_excludes_it_from_the_count(self):
        self._activity(verb="task_completed")
        auth_client(self.owner).patch(
            "/api/notification-preferences/",
            {"muted_categories": ["projects"]},
            format="json",
        )
        res = auth_client(self.owner).get("/api/activities/unread-count/")
        self.assertEqual(res.data["count"], 0)

    def test_the_full_audit_trail_ignores_mute_preferences(self):
        self._activity(verb="task_completed")
        auth_client(self.owner).patch(
            "/api/notification-preferences/",
            {"muted_categories": ["projects"]},
            format="json",
        )
        res = auth_client(self.owner).get("/api/activities/")
        self.assertEqual(len(res.data), 1)


class NotificationPreferencesTests(NotificationBellTestCase):
    def test_get_lists_every_available_category(self):
        res = auth_client(self.owner).get("/api/notification-preferences/")
        self.assertIn("messages", res.data["available_categories"])
        self.assertIn("bookings", res.data["available_categories"])
        self.assertEqual(res.data["muted_categories"], [])

    def test_an_unknown_category_is_rejected(self):
        res = auth_client(self.owner).patch(
            "/api/notification-preferences/",
            {"muted_categories": ["not_a_real_category"]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_a_valid_category_list_is_saved(self):
        res = auth_client(self.owner).patch(
            "/api/notification-preferences/",
            {"muted_categories": ["messages", "documents"]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.owner.refresh_from_db()
        self.assertEqual(
            set(self.owner.muted_notification_categories),
            {"messages", "documents"},
        )


class MessageActivityLoggingTests(NotificationBellTestCase):
    def test_sending_a_message_creates_an_activity_entry(self):
        auth_client(self.owner).post(
            "/api/messages/",
            {"project": self.project.id, "body": "Hello"},
        )
        self.assertTrue(
            Activity.objects.filter(verb="message_sent").exists()
        )

    def test_the_client_sees_the_message_activity_too(self):
        auth_client(self.owner).post(
            "/api/messages/",
            {"project": self.project.id, "body": "Hello"},
        )
        res = auth_client(self.client_user).get("/api/activities/")
        verbs = [entry["verb"] for entry in res.data]
        self.assertIn("message_sent", verbs)
