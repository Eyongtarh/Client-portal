from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken, OutstandingToken,
)


def revoke_refresh_tokens(user):
    """Blacklists every outstanding refresh token for this user, so a
    password change or reset signs out every other session once its
    short lived access token expires.
    """
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)
