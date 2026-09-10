"""Stripe Connect (Standard) onboarding: the owner starts an OAuth
flow to link their own Stripe account, Stripe redirects back with a
code this view exchanges server-side, and the resulting connected
account id unblocks checkout for that workspace's clients.
"""
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

from django.core import signing
from django.test import TestCase, override_settings

from portal.models import Client, User, Workspace
from portal.tests.helpers import auth_client


class StripeConnectTestCase(TestCase):
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
        Client.objects.create(
            workspace=self.workspace,
            user=self.client_user,
            company_name="Client Co",
            contact_email="client@example.com",
        )


@override_settings(STRIPE_CONNECT_CLIENT_ID="ca_test_123")
class ConnectStartTests(StripeConnectTestCase):
    def test_owner_gets_stripe_authorize_url(self):
        res = auth_client(self.owner).get("/api/workspace/stripe/connect/")
        self.assertEqual(res.status_code, 200, res.data)
        parsed = urlparse(res.data["url"])
        self.assertEqual(parsed.netloc, "connect.stripe.com")
        params = parse_qs(parsed.query)
        self.assertEqual(params["client_id"], ["ca_test_123"])
        self.assertIn("state", params)
        # state must resolve back to this exact workspace - the
        # callback trusts it in place of an auth header.
        payload = signing.loads(params["state"][0])
        self.assertEqual(payload["workspace_id"], self.workspace.id)

    def test_client_cannot_start_connect(self):
        res = auth_client(self.client_user).get(
            "/api/workspace/stripe/connect/"
        )
        self.assertEqual(res.status_code, 403)

    @override_settings(STRIPE_CONNECT_CLIENT_ID="")
    def test_blocked_when_connect_not_configured(self):
        res = auth_client(self.owner).get("/api/workspace/stripe/connect/")
        self.assertEqual(res.status_code, 400)


class ConnectCallbackTests(StripeConnectTestCase):
    def _state(self, workspace_id=None):
        return signing.dumps(
            {"workspace_id": workspace_id or self.workspace.id}
        )

    @patch("portal.views.stripe.OAuth.token")
    def test_valid_code_links_the_account(self, mock_token):
        mock_token.return_value = {"stripe_user_id": "acct_linked_123"}
        res = self.client.get(
            "/api/workspace/stripe/connect/callback/",
            {"code": "ac_test", "state": self._state()},
        )
        self.assertEqual(res.status_code, 302)
        self.assertIn("stripe_connect=success", res.url)
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.stripe_account_id, "acct_linked_123")

    def test_denied_authorization_redirects_with_error(self):
        res = self.client.get(
            "/api/workspace/stripe/connect/callback/",
            {"error": "access_denied", "state": self._state()},
        )
        self.assertEqual(res.status_code, 302)
        self.assertIn("stripe_connect=error", res.url)
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.stripe_account_id, "")

    def test_tampered_state_is_rejected(self):
        res = self.client.get(
            "/api/workspace/stripe/connect/callback/",
            {"code": "ac_test", "state": "not-a-real-signed-token"},
        )
        self.assertEqual(res.status_code, 302)
        self.assertIn("stripe_connect=error", res.url)
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.stripe_account_id, "")

    @patch("portal.views.stripe.OAuth.token")
    def test_stripe_error_during_exchange_redirects_with_error(
        self, mock_token
    ):
        import stripe

        mock_token.side_effect = stripe.error.StripeError("boom")
        res = self.client.get(
            "/api/workspace/stripe/connect/callback/",
            {"code": "ac_test", "state": self._state()},
        )
        self.assertEqual(res.status_code, 302)
        self.assertIn("stripe_connect=error", res.url)
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.stripe_account_id, "")


class ConnectDisconnectTests(StripeConnectTestCase):
    def setUp(self):
        super().setUp()
        self.workspace.stripe_account_id = "acct_linked_123"
        self.workspace.save()

    @patch("portal.views.stripe.OAuth.deauthorize")
    def test_owner_can_disconnect(self, mock_deauth):
        mock_deauth.return_value = MagicMock()
        res = auth_client(self.owner).post(
            "/api/workspace/stripe/connect/disconnect/"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(res.data["stripe_connected"])
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.stripe_account_id, "")

    def test_client_cannot_disconnect(self):
        res = auth_client(self.client_user).post(
            "/api/workspace/stripe/connect/disconnect/"
        )
        self.assertEqual(res.status_code, 403)
        self.workspace.refresh_from_db()
        self.assertEqual(
            self.workspace.stripe_account_id, "acct_linked_123"
        )
