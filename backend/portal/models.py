from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Everyone who logs in — freelancers/business owners AND their
    clients — is a User, distinguished by role."""
    class Role(models.TextChoices):
        OWNER = "owner", "Workspace Owner"
        CLIENT = "client", "Client"
    role = models.CharField(max_length=20, choices=Role.choices)
    email = models.EmailField(unique=True)
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return f"{self.email} ({self.role})"
