"""Self-service profile editing (AUTH-05, PORTAL-04): updating your
own name/email via PATCH /api/auth/me/, and changing your own
password via POST /api/auth/change-password/ (kept separate from
plain profile fields so the current password must be verified
first - a hijacked but still-logged-in session shouldn't be able to
silently lock the real user out).
"""
from django.test import TestCase

from portal.models import User, Workspace
from portal.tests.helpers import auth_client


class MeUpdateTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="pw12345678",
            role="owner",
            first_name="Original",
        )
        Workspace.objects.create(owner=self.user, name="Acme")

    def test_can_update_name_and_email(self):
        res = auth_client(self.user).patch(
            "/api/auth/me/",
            {"first_name": "Updated", "email": "new@example.com"},
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Updated")
        self.assertEqual(self.user.email, "new@example.com")

    def test_cannot_take_another_users_email(self):
        User.objects.create_user(
            username="other",
            email="taken@example.com",
            password="pw12345678",
            role="owner",
        )
        res = auth_client(self.user).patch(
            "/api/auth/me/", {"email": "taken@example.com"}
        )
        self.assertEqual(res.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "owner@example.com")

    def test_keeping_own_email_is_fine(self):
        res = auth_client(self.user).patch(
            "/api/auth/me/",
            {"first_name": "Same Email", "email": "owner@example.com"},
        )
        self.assertEqual(res.status_code, 200, res.data)

    def test_cannot_change_role_or_username(self):
        res = auth_client(self.user).patch(
            "/api/auth/me/", {"role": "client", "username": "hijacked"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, "owner")
        self.assertEqual(self.user.username, "owner")


class ChangePasswordTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="pw12345678",
            role="owner",
        )

    def test_can_change_password_with_correct_current_password(self):
        res = auth_client(self.user).post(
            "/api/auth/change-password/",
            {
                "current_password": "pw12345678",
                "new_password": "newpassword123",
            },
        )
        self.assertEqual(res.status_code, 204)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpassword123"))

    def test_wrong_current_password_is_rejected(self):
        res = auth_client(self.user).post(
            "/api/auth/change-password/",
            {
                "current_password": "wrongpassword",
                "new_password": "newpassword123",
            },
        )
        self.assertEqual(res.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("pw12345678"))

    def test_new_password_must_meet_minimum_length(self):
        res = auth_client(self.user).post(
            "/api/auth/change-password/",
            {"current_password": "pw12345678", "new_password": "short"},
        )
        self.assertEqual(res.status_code, 400)
