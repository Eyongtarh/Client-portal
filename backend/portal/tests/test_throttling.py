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
