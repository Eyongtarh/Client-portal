import uuid
from django.utils import timezone
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.text import slugify


class User(AbstractUser):
    """Everyone who logs in — freelancers/business owners, their
    staff, AND their clients — is a User, distinguished by role.
    staff_workspace is only set for role=STAFF (a team member
    invited into someone else's workspace); the owner still owns
    their workspace via the Workspace.owner OneToOne below.
    """

    class Role(models.TextChoices):
        OWNER = "owner", "Workspace Owner"
        STAFF = "staff", "Team Member"
        CLIENT = "client", "Client"
    role = models.CharField(max_length=20, choices=Role.choices)
    email = models.EmailField(unique=True)
    staff_workspace = models.ForeignKey(
        "Workspace",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="team_members",
    )
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def get_workspace(self):
        """Returns the single workspace this user acts within,
        regardless of whether they're the owner or invited staff.
        """
        if self.role == self.Role.OWNER:
            return self.workspace
        if self.role == self.Role.STAFF:
            return self.staff_workspace
        return None

    def __str__(self):
        return f"{self.email} ({self.role})"


def logo_upload_path(instance, filename):
    """Logos live under a per-workspace folder."""
    return f"workspaces/{instance.id}/logo/{filename}"


class Workspace(models.Model):
    """One workspace per business/freelancer. Everything else - clients,
    projects, bookings, invoices - hangs off this. This is what makes
    the app multi-tenant: every query gets scoped to a workspace so one
    business never sees another's data. timezone is an IANA name (e.g.
    "Europe/Stockholm") and drives working-hours/availability math -
    it's the business's actual location, independent of the server's
    own clock.
    """
    owner = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="workspace"
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, blank=True)
    logo = models.ImageField(
        upload_to=logo_upload_path, null=True, blank=True
    )
    currency = models.CharField(max_length=5, default="EUR")
    country = models.CharField(
        max_length=2,
        blank=True,
        default="",
        help_text="ISO 3166-1 alpha-2 code driving the currency "
        "picker (see portal.currencies) - blank for workspaces "
        "created before this field existed.",
    )
    timezone = models.CharField(max_length=50, default="UTC")
    brand_color = models.CharField(
        max_length=7,
        default="#2563eb",
        help_text="Hex color, e.g. #2563eb",
    )
    reminder_hours_before = models.PositiveIntegerField(
        default=24,
        help_text="How many hours before an appointment "
        "send_booking_reminders should email a reminder (BOOK-59).",
    )
    plan = models.ForeignKey(
        "SubscriptionPlan",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workspaces",
    )
    stripe_account_id = models.CharField(
        max_length=32,
        blank=True,
        default="",
        help_text="Connected Stripe Standard account (acct_...) this "
        "workspace's owner linked via OAuth (see views.WorkspaceStripe"
        "ConnectCallbackView). Client checkout sessions are created "
        "directly on this account so payments land in the owner's own "
        "Stripe balance, not the platform's. Blank means the owner "
        "hasn't connected one yet - checkout is blocked until they do.",
    )
    public_booking_enabled = models.BooleanField(
        default=False,
        help_text="Whether /book/<slug> (PublicBookingView, BOOK-26/"
        "30) is reachable by anyone with the link, letting a guest "
        "book without an account (BOOK-21). Off by default - an "
        "owner opts in once they're ready to share it.",
    )
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


class SubscriptionPlan(models.Model):
    """A fixed pricing tier. Seeded via a data migration, not
    created through the app - owners choose from these, they
    don't define their own.
    """
    name = models.CharField(max_length=100, unique=True)
    price_per_month = models.DecimalField(max_digits=10, decimal_places=2)
    max_clients = models.PositiveIntegerField(
        null=True, blank=True, help_text="Blank = unlimited"
    )
    max_team_members = models.PositiveIntegerField(
        null=True, blank=True, help_text="Blank = unlimited"
    )

    class Meta:
        ordering = ["price_per_month"]

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
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Owner/staff-only notes and preferences about this "
        "client (CLIENT-05) - never exposed to the client themselves.",
    )
    is_archived = models.BooleanField(
        default=False,
        help_text="Hides an inactive client from the default list "
        "(CLIENT-04) without deleting their history.",
    )
    assigned_staff = models.ManyToManyField(
        User,
        blank=True,
        related_name="assigned_clients",
        limit_choices_to={"role": "staff"},
        help_text="Team members responsible for this client (TEAM-04) "
        "- a staff member's 'my clients' view, and by extension their "
        "'my projects' view, is derived from this rather than a "
        "separate per-project assignment, since every project in "
        "this app already hangs off exactly one client.",
    )
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


class TeamInvite(models.Model):
    """A pending invitation for a team member to join a workspace
    with staff access. Same pattern as ClientInvite: the invitee
    clicks the emailed link, sets a password, and becomes a
    role=STAFF User tied to this workspace.
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="team_invites"
    )
    email = models.EmailField()
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
        return f"Team invite for {self.email} ({self.workspace.name})"


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


class Task(models.Model):
    """A single to-do item within a project, optionally grouped
    under a milestone. Separate from Milestone: milestones are
    project stages, tasks are the actual work items within them.
    """
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="tasks"
    )
    milestone = models.ForeignKey(
        Milestone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    due_date = models.DateField(null=True, blank=True)
    is_complete = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class Approval(models.Model):
    """A request for the client to formally approve (or reject)
    a deliverable. Gives both sides a recorded decision instead
    of an email thread.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        CHANGES_REQUESTED = (
            "changes_requested", "Changes requested"
        )

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="approvals"
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    client_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


def service_photo_upload_path(instance, filename):
    """Service photos live under a per-workspace folder."""
    return (
        f"workspaces/{instance.workspace_id}/"
        f"services/{filename}"
    )


class Service(models.Model):
    """A bookable offering - e.g. "Haircut", "Consultation".
    Defines duration and price; availability is computed from
    WorkingHours minus existing Bookings. capacity is how many
    clients can book the same time slot - 1 for a normal one-
    on-one appointment, higher for a class or group session.
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="services"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    photo = models.ImageField(
        upload_to=service_photo_upload_path, null=True, blank=True
    )
    duration_minutes = models.PositiveIntegerField()
    price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    capacity = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    location = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Where an in-person appointment takes place "
        "(BOOK-06), e.g. an address or room name.",
    )
    is_online = models.BooleanField(
        default=False,
        help_text="Whether this service is conducted virtually "
        "(BOOK-07). meeting_link is only meaningful when this is set.",
    )
    meeting_link = models.URLField(
        blank=True,
        default="",
        help_text="Video call link shared with the client once "
        "booked (BOOK-07), e.g. a Zoom or Google Meet URL.",
    )
    instructions = models.TextField(
        blank=True,
        default="",
        help_text="What the client should prepare or know before "
        "the appointment (BOOK-08), shown to them when booking.",
    )
    staff = models.ManyToManyField(
        User,
        blank=True,
        related_name="bookable_services",
        limit_choices_to={"role": "staff"},
        help_text="Team members qualified to perform this service "
        "(TEAM-05). Empty means any team member can - the field is "
        "informational for now (BOOK-04/10/19, staff selection in "
        "the booking flow itself, is a separate follow-up).",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class PaymentRequirement(models.TextChoices):
        NONE = "none", "No payment at booking"
        DEPOSIT = "deposit", "Deposit required"
        FULL = "full", "Full payment required"

    payment_requirement = models.CharField(
        max_length=10,
        choices=PaymentRequirement.choices,
        default=PaymentRequirement.NONE,
    )
    deposit_percent = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Percent of price required as a deposit at "
        "booking time. Only used when payment_requirement is "
        "'deposit'.",
    )
    cancellation_notice_hours = models.PositiveIntegerField(
        default=24,
        help_text="Minimum hours before the appointment a client "
        "can cancel or reschedule without triggering the late "
        "cancellation fee.",
    )
    late_cancellation_fee_percent = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Percent of price treated as a late-cancellation/"
        "no-show fee when cancelled inside the notice window. "
        "Blank = no fee - any deposit paid is simply refundable.",
    )
    buffer_before_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Prep time required before this service starts "
        "(BOOK-13) - blocks the slot immediately prior to a booking, "
        "even if it would otherwise fit.",
    )
    buffer_after_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Recovery time required after this service ends "
        "(BOOK-13) - blocks the slot immediately after a booking.",
    )
    min_notice_hours = models.PositiveIntegerField(
        default=0,
        help_text="How many hours in advance a booking must be made "
        "(BOOK-14). 0 = bookable right up to the start time.",
    )
    max_advance_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Furthest in the future this service can be "
        "booked (BOOK-15). Blank = no limit.",
    )
    max_bookings_per_day = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Caps total confirmed bookings of this service on "
        "any single day (BOOK-16), regardless of who's assigned. "
        "Blank = no limit.",
    )
    max_bookings_per_week = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Caps total confirmed bookings of this service "
        "within any calendar week (BOOK-16, Monday-Sunday). Blank = "
        "no limit.",
    )

    def __str__(self):
        return self.name


class ServiceQuestion(models.Model):
    """A custom intake question an owner attaches to a service
    (BOOK-69) - the client answers it while booking (BOOK-70) and
    the answer is stored on the Booking itself (Booking.
    custom_answers) so the owner can review it before the
    appointment (BOOK-71).
    """

    class QuestionType(models.TextChoices):
        TEXT = "text", "Short answer"
        CHOICE = "choice", "Multiple choice"

    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="service_questions"
    )
    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, related_name="questions"
    )
    text = models.CharField(max_length=500)
    question_type = models.CharField(
        max_length=10,
        choices=QuestionType.choices,
        default=QuestionType.TEXT,
    )
    choices = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="Comma-separated options. Only used when "
        "question_type is 'choice'.",
    )
    required = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.text

    def choice_list(self):
        return [c.strip() for c in self.choices.split(",") if c.strip()]


class BlockedTime(models.Model):
    """An unavailable window that overrides working hours entirely -
    a holiday (BOOK-11) is just one that spans a whole day and has
    no staff set (blocks the entire workspace); a specific block
    (BOOK-12, e.g. a dentist appointment) is the same model with a
    narrower window and, usually, a staff member set so it only
    blocks that person.
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="blocked_times"
    )
    staff = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="blocked_times",
        limit_choices_to={"role": "staff"},
        help_text="Blank blocks the whole workspace (a holiday); set "
        "to block only that team member's own calendar.",
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    reason = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start_time"]

    def __str__(self):
        return self.reason or f"Blocked {self.start_time} - {self.end_time}"


def resource_photo_upload_path(instance, filename):
    """Resource photos live under a per-workspace folder."""
    return (
        f"workspaces/{instance.workspace_id}/"
        f"resources/{filename}"
    )


class Resource(models.Model):
    """A shared, bookable thing - a room, a piece of equipment, a
    chair, a vehicle - that only one booking can hold at a time
    (or up to `quantity` bookings at once, e.g. 3 identical
    chairs). Resources are associated with one or more Services;
    a booking for that service reserves one unit of each
    associated resource for its time slot. A resource can also
    be booked directly (independent of any service) for
    duration_minutes at a time - e.g. reserving a chair for an
    hour, or a room for a full 24-hour day - with slots offered
    across the full day rather than the workspace's working
    hours, since a resource booking isn't tied to staff time.
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="resources"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    photo = models.ImageField(
        upload_to=resource_photo_upload_path, null=True, blank=True
    )
    quantity = models.PositiveIntegerField(
        default=1,
        help_text="How many identical units exist, e.g. 3 chairs.",
    )
    price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Price for a direct booking of this resource, "
        "optional.",
    )
    duration_minutes = models.PositiveIntegerField(
        default=60,
        help_text="Default booking length when this resource is "
        "booked directly, without a service. Up to 1440 for a "
        "full 24-hour slot.",
    )
    services = models.ManyToManyField(
        Service, blank=True, related_name="resources"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class PaymentMethod(models.Model):
    """A manual, offline way for clients to pay this workspace
    directly (e.g. Mobile Money, Orange Money, bank transfer) -
    for workspaces in countries Stripe Connect doesn't support
    payouts to. Purely informational: the client sends money
    themselves outside the app, and the owner/staff then marks the
    invoice or booking paid by hand (see InvoiceViewSet.mark_paid
    and BookingViewSet.mark_paid) - there's no automated
    confirmation, so this is never a substitute for a real webhook
    where one is available (i.e. card payments via Stripe Connect).
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="payment_methods"
    )
    name = models.CharField(
        max_length=100,
        help_text="e.g. \"MTN Mobile Money\", \"Orange Money\", "
        "\"Bank transfer\".",
    )
    account_details = models.TextField(
        help_text="Whatever the client needs to send money directly - "
        "phone number, account number, account holder name, etc.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.workspace.name})"


class WorkingHours(models.Model):
    """One weekly recurring availability window per workspace.
    Multiple rows can exist for the same weekday (e.g. a lunch
    break splits the day into two windows).
    """

    class Weekday(models.IntegerChoices):
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="working_hours",
    )
    staff = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="working_hours",
        limit_choices_to={"role": "staff"},
        help_text="Left blank, this is the workspace's default "
        "availability. Set to a team member, it overrides the "
        "default for that person only (TEAM-05/BOOK-10) - "
        "AvailabilityView falls back to the workspace default rows "
        "when a staff member has none of their own.",
    )
    weekday = models.IntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ["weekday", "start_time"]

    def __str__(self):
        return (
            f"{self.get_weekday_display()} "
            f"{self.start_time}-{self.end_time}"
        )


class RecurringSeries(models.Model):
    """Groups a set of Bookings created together on a weekly
    repeat, so a client can cancel one occurrence or the whole
    series. The Bookings themselves still carry all the actual
    scheduling data - this is just the grouping.
    """
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="recurring_series",
    )
    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, related_name="recurring_series"
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="recurring_series",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.service.name} series ({self.client.company_name})"


class WaitlistEntry(models.Model):
    """A client's request to be notified if a specific fully-
    booked slot opens up. Notifying doesn't auto-book anything -
    the client still has to complete the booking themselves once
    they get the email, first come first served.
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="waitlist_entries"
    )
    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, related_name="waitlist_entries"
    )
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name="waitlist_entries"
    )
    start_time = models.DateTimeField()
    notified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return (
            f"{self.client.company_name} waiting for "
            f"{self.service.name} at {self.start_time}"
        )


class Booking(models.Model):
    """A confirmed appointment. Multiple bookings can share the
    same slot up to the service's capacity (see BookingSerializer
    for the capacity check). series is set only for bookings
    created as part of a weekly-recurring set. Exactly one of
    service or resource is set: service bookings work as before
    (and implicitly reserve any resources tied to that service);
    resource bookings are a direct reservation of a resource on
    its own (e.g. booking a chair for an hour, or a room for a
    full day), with no service involved.
    """

    class Status(models.TextChoices):
        CONFIRMED = "confirmed", "Confirmed"
        CANCELLED = "cancelled", "Cancelled"
        COMPLETED = "completed", "Completed"
        NO_SHOW = "no_show", "No-show"

    class PaymentStatus(models.TextChoices):
        NOT_REQUIRED = "not_required", "Not required"
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        REFUNDED = "refunded", "Refunded"

    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="bookings"
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.CASCADE,
        related_name="bookings",
        null=True,
        blank=True,
    )
    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name="direct_bookings",
        null=True,
        blank=True,
    )
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name="bookings"
    )
    staff = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_bookings",
        limit_choices_to={"role": "staff"},
        help_text="Which team member is handling this appointment "
        "(TEAM-04/TEAM-05, SEARCH-04) - manually assigned by owner/"
        "staff for now; not yet factored into availability, so "
        "assigning someone doesn't block their calendar elsewhere.",
    )
    series = models.ForeignKey(
        RecurringSeries,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings",
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.CONFIRMED
    )
    notes = models.TextField(blank=True)
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.NOT_REQUIRED,
    )
    payment_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount required at booking time (deposit or "
        "full price), snapshotted from the service's policy so a "
        "later price change never changes what was already owed.",
    )
    stripe_checkout_session_id = models.CharField(
        max_length=255, blank=True
    )
    stripe_payment_intent_id = models.CharField(
        max_length=255, blank=True
    )
    is_late_cancellation = models.BooleanField(
        default=False,
        help_text="Set when cancelled inside the service's "
        "cancellation_notice_hours window, for the owner to see "
        "at a glance whether the late-cancellation fee applies.",
    )
    reminder_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set by the send_booking_reminders management "
        "command once a reminder email has gone out, so the same "
        "booking is never reminded twice.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    custom_answers = models.JSONField(
        default=dict,
        blank=True,
        help_text="BOOK-69/70/71: this service's ServiceQuestion "
        "answers at booking time, keyed by question id as a string "
        "(e.g. {'3': 'Curly'}) so the owner can review them before "
        "the appointment.",
    )

    class Meta:
        ordering = ["start_time"]

    def __str__(self):
        target = self.service.name if self.service else self.resource.name
        return f"{target} - {self.client.company_name}"


class Review(models.Model):
    """A client's rating + comment on a service, tied to the
    specific booking that prompted it (so a client can only
    review something they actually attended). The owner can
    post one public response per review but never edits the
    client's rating or comment.
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="reviews"
    )
    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, related_name="reviews"
    )
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name="reviews"
    )
    booking = models.OneToOneField(
        Booking, on_delete=models.CASCADE, related_name="review"
    )
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    owner_response = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.client.company_name} rated {self.service.name} "
            f"{self.rating}/5"
        )


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
    the project's client, unless marked private (DOC-06).
    """
    class Category(models.TextChoices):
        CONTRACT = "contract", "Contract"
        DELIVERABLE = "deliverable", "Deliverable"
        INVOICE = "invoice", "Invoice"
        REFERENCE = "reference", "Reference"
        OTHER = "other", "Other"

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="documents"
    )
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True
    )
    file = models.FileField(upload_to=document_upload_path)
    original_name = models.CharField(max_length=255)
    size_bytes = models.PositiveIntegerField(default=0)
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.OTHER,
    )
    is_private = models.BooleanField(
        default=False,
        help_text="Owner/staff-only visibility (DOC-06) - hidden from "
        "the client entirely, not just non-downloadable. Only owner/"
        "staff can set this; a client's own uploads are always "
        "visible to the workspace (see DocumentViewSet).",
    )
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
    body = models.TextField(blank=True, default="")
    attachment = models.FileField(
        upload_to=document_upload_path, blank=True, null=True
    )
    attachment_name = models.CharField(max_length=255, blank=True, default="")
    attachment_size_bytes = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class Invoice(models.Model):
    """A bill sent to a client. The total is computed from its
    line items, never stored directly - so it can never drift out
    of sync with what the items actually add up to.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        PAID = "paid", "Paid"
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="invoices"
    )
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name="invoices"
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )
    number = models.CharField(max_length=50)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    issued_at = models.DateField(default=timezone.localdate)
    due_at = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    stripe_checkout_session_id = models.CharField(
        max_length=255, blank=True
    )
    stripe_payment_intent_id = models.CharField(
        max_length=255, blank=True
    )

    class Meta:
        unique_together = ("workspace", "number")

    @property
    def total(self):
        return sum(
            (item.amount for item in self.items.all()),
            start=0,
        )

    def __str__(self):
        return f"Invoice #{self.number}"


class InvoiceItem(models.Model):
    invoice = models.ForeignKey(
        Invoice, on_delete=models.CASCADE, related_name="items"
    )
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=10, decimal_places=2)


class Activity(models.Model):
    """A read-only audit-trail entry: who did what, to which
    object, when. Created internally via portal.activity.log()
    whenever a tracked action happens - never written directly
    through the API. `verb` is a stable code (e.g.
    "invoice_paid") the frontend maps to a translated sentence,
    not free text. `target_repr` snapshots the object's label at
    the time of the action so the entry stays readable even if the
    object is later renamed or deleted. `client` scopes visibility:
    set for anything tied to one client's relationship (so that
    client can see it in their own portal); left blank for
    workspace-internal events (e.g. a team member joining) that
    only the owner/staff should see.
    """
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="activities"
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    verb = models.CharField(max_length=50)
    target_type = models.CharField(max_length=50)
    target_id = models.PositiveIntegerField(null=True, blank=True)
    target_repr = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "activities"

    def __str__(self):
        who = self.actor.email if self.actor else "Someone"
        return f"{who} - {self.verb} - {self.target_repr}"
