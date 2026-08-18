from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.text import slugify


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


class Workspace(models.Model):
    """One workspace per business/freelancer. Everything else - clients,
    projects, bookings, invoices - hangs off this. This is what makes
    the app multi-tenant: every query gets scoped to a workspace so one
    business never sees another's data.
    """
    owner = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="workspace"
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or "workspace"
            slug = base
            i = 1
            existing = Workspace.objects.filter(slug=slug)
            existing = existing.exclude(pk=self.pk)
            while existing.exists():
                i += 1
                slug = f"{base}-{i}"
                existing = Workspace.objects.filter(slug=slug)
                existing = existing.exclude(pk=self.pk)
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Client(models.Model):
    """A client company/contact within a workspace. `user` is nullable
    because a Client record can exist before the invited person accepts
    and creates a login - we link `user` once they accept.
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="clients"
    )
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="client_profile",
        null=True,
        blank=True,
    )
    company_name = models.CharField(max_length=255)
    contact_email = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("workspace", "contact_email")

    def __str__(self):
        return self.company_name
