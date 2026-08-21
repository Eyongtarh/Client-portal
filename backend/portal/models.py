import uuid
from django.utils import timezone
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


class ClientInvite(models.Model):
    """A pending invitation for a client to join a workspace. The
    client clicks the emailed link, sets a password, and becomes a
    User + Client. Expires after 7 days if unused.
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="invites"
    )
    email = models.EmailField()
    company_name = models.CharField(max_length=255)
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    accepted = models.BooleanField(default=False)
    expires_at = models.DateTimeField()

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(days=7)
        super().save(*args, **kwargs)

    def is_valid(self):
        return not self.accepted and timezone.now() < self.expires_at

    def __str__(self):
        return f"Invite for {self.email} ({self.workspace.name})"


class Project(models.Model):
    """A body of work for a client, belonging to a workspace."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        ON_HOLD = "on_hold", "On hold"

    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="projects"
    )
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name="projects"
    )
    name = models.CharField(max_length=255)
    budget = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    start_date = models.DateField(null=True, blank=True)
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def progress_percent(self):
        """Percent of milestones marked complete, 0 if there are none."""
        total = self.milestones.count()
        if total == 0:
            return 0
        done = self.milestones.filter(is_complete=True).count()
        return round(done / total * 100)

    def __str__(self):
        return f"{self.name} ({self.client.company_name})"


class Milestone(models.Model):
    """A stage within a project - what the client sees checked off
    as work progresses.
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="milestones"
    )
    title = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0)
    is_complete = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


def document_upload_path(instance, filename):
    """Files land under a workspace/project-scoped folder, so uploads
    from different tenants never collide or overwrite each other.
    """
    return (
        f"workspaces/{instance.project.workspace_id}/"
        f"projects/{instance.project_id}/{filename}"
    )


class Document(models.Model):
    """A file attached to a project - visible to both the owner and
    the project's client.
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="documents"
    )
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True
    )
    file = models.FileField(upload_to=document_upload_path)
    original_name = models.CharField(max_length=255)
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.original_name


class Message(models.Model):
    """A single chat message within a project, visible to both the
    owner and the client on that project.
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
