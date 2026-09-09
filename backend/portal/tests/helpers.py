"""Shared test scaffolding - an authenticated APIClient for a given
user, since nearly every view test needs one and hand-rolling the
JWT dance in every test file would just be noise.
"""
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


def auth_client(user):
    api = APIClient()
    token = RefreshToken.for_user(user)
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
    return api
