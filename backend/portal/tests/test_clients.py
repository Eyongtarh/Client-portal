"""Client archiving (CLIENT-04) and notes (CLIENT-05). The
invariant that matters here is privacy: notes are for the
workspace's own eyes, so a client must never see notes written
about them, and must never be able to archive/edit their own
record - only owner/staff can.
"""
from django.test import TestCase

from portal.models import Client, User, Workspace
from portal.tests.helpers import auth_client


class ClientArchiveAndNotesTestCase(TestCase):
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
            notes="Prefers morning appointments.",
        )


class ArchiveTests(ClientArchiveAndNotesTestCase):
    def test_archived_client_hidden_from_default_list(self):
        self.client_profile.is_archived = True
        self.client_profile.save()
        res = auth_client(self.owner).get("/api/clients/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 0)

    def test_archived_filter_shows_only_archived(self):
        self.client_profile.is_archived = True
        self.client_profile.save()
        res = auth_client(self.owner).get("/api/clients/?archived=true")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_owner_can_archive_a_client(self):
        res = auth_client(self.owner).patch(
            f"/api/clients/{self.client_profile.id}/",
            {"is_archived": True},
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.client_profile.refresh_from_db()
        self.assertTrue(self.client_profile.is_archived)

    def test_archived_client_still_reachable_by_id(self):
        self.client_profile.is_archived = True
        self.client_profile.save()
        res = auth_client(self.owner).get(
            f"/api/clients/{self.client_profile.id}/"
        )
        self.assertEqual(res.status_code, 200)

    def test_client_cannot_archive_self(self):
        res = auth_client(self.client_user).patch(
            f"/api/clients/{self.client_profile.id}/",
            {"is_archived": True},
        )
        self.assertEqual(res.status_code, 403)
        self.client_profile.refresh_from_db()
        self.assertFalse(self.client_profile.is_archived)


class NotesPrivacyTests(ClientArchiveAndNotesTestCase):
    def test_owner_sees_notes(self):
        res = auth_client(self.owner).get(
            f"/api/clients/{self.client_profile.id}/"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("notes", res.data)
        self.assertEqual(res.data["notes"], "Prefers morning appointments.")

    def test_owner_can_update_notes(self):
        res = auth_client(self.owner).patch(
            f"/api/clients/{self.client_profile.id}/",
            {"notes": "Allergic to fragrance products."},
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.client_profile.refresh_from_db()
        self.assertEqual(
            self.client_profile.notes, "Allergic to fragrance products."
        )

    def test_client_cannot_see_own_notes(self):
        res = auth_client(self.client_user).get(
            f"/api/clients/{self.client_profile.id}/"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertNotIn("notes", res.data)

    def test_client_cannot_edit_own_record(self):
        res = auth_client(self.client_user).patch(
            f"/api/clients/{self.client_profile.id}/",
            {"company_name": "Hijacked Inc"},
        )
        self.assertEqual(res.status_code, 403)
        self.client_profile.refresh_from_db()
        self.assertEqual(self.client_profile.company_name, "Client Co")
