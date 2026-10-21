"""Unauthenticated endpoints that can be brute forced or used to send
email are rate limited per client IP.
"""
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle


class AuthThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_login_is_throttled_after_repeated_attempts(self):
        client = APIClient()
        with patch.object(
            ScopedRateThrottle, "THROTTLE_RATES", {"auth": "3/min"}
        ):
            codes = [
                client.post(
                    "/api/auth/login/",
                    {"username": "nobody", "password": "wrong"},
                    format="json",
                ).status_code
                for _ in range(5)
            ]
        self.assertNotIn(429, codes[:3])
        self.assertEqual(codes[3:], [429, 429])

    def test_password_reset_request_is_throttled(self):
        client = APIClient()
        with patch.object(
            ScopedRateThrottle, "THROTTLE_RATES", {"auth": "2/min"}
        ):
            codes = [
                client.post(
                    "/api/auth/password-reset/",
                    {"email": "a@example.com"},
                    format="json",
                ).status_code
                for _ in range(3)
            ]
        self.assertEqual(codes[-1], 429)


class LogoutTests(TestCase):
    def test_logout_blacklists_the_refresh_token(self):
        from rest_framework_simplejwt.token_blacklist.models import (
            BlacklistedToken,
        )
        from rest_framework_simplejwt.tokens import RefreshToken

        from portal.models import User

        user = User.objects.create_user(
            username="u", email="u@example.com", password="pw12345678",
            role="owner",
        )
        refresh = RefreshToken.for_user(user)
        client = APIClient()
        res = client.post(
            "/api/auth/logout/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(res.status_code, 204)
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists()
        )
        # The revoked token can no longer mint access tokens.
        again = client.post(
            "/api/auth/refresh/", {"refresh": str(refresh)}, format="json"
        )
        self.assertEqual(again.status_code, 401)

    def test_logout_with_a_bad_token_is_still_a_204(self):
        res = APIClient().post(
            "/api/auth/logout/", {"refresh": "garbage"}, format="json"
        )
        self.assertEqual(res.status_code, 204)
