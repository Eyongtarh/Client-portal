from decimal import Decimal

from .currencies import VALID_CURRENCIES
from .models import (
    Activity, Approval, BlockedTime, BookingResourceCharge, Client,
    ClientInvite, Document, Invoice, InvoiceItem, Location, Message,
    Milestone, PaymentMethod, Project, RecurringSeries, Resource,
    ResourceAvailability, ResourceRental, ResourceRentalPolicy,
    ResourceReservation, Review, Service, ServiceQuestion,
    ServiceResourceRequirement, SubscriptionPlan,
    Task, TeamInvite, User, WaitlistEntry, WorkingHours, Booking, Workspace,
)
from .resource_availability import (
    ResourceRequirement, resource_has_capacity, resource_is_bookable,
    service_resource_requirements,
)
from rest_framework import serializers
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.conf import settings
from django.core.mail import send_mail


class ActivitySerializer(serializers.ModelSerializer):
    """actor_name resolves to whichever label makes sense for who
    performed the action - a client's company name, or a staff/
    owner's first name/email - so the frontend never has to know
    the difference. is_read is per the requesting user (NOTIF-01),
    not a global flag - see Activity.read_by.
    """
    actor_name = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Activity
        fields = [
            "id", "verb", "target_type", "target_id", "target_repr",
            "actor_name", "client", "metadata", "created_at", "is_read",
        ]

    def get_actor_name(self, obj):
        if not obj.actor:
            return None
        if obj.actor.role == "client":
            client = getattr(obj.actor, "client_profile", None)
            return client.company_name if client else obj.actor.email
        return obj.actor.first_name or obj.actor.email

    def get_is_read(self, obj):
        user = self.context.get("request").user
        return obj.read_by.filter(pk=user.pk).exists()


class ClientSerializer(serializers.ModelSerializer):
    """Owner/staff view - includes `notes` (CLIENT-05) and
    `is_archived` (CLIENT-04). Never used for the client's own view
    of themselves - see ClientSelfSerializer - since notes are
    meant to stay private to the workspace side. `assigned_staff` is
    the team members responsible for this client (TEAM-04); a
    staff's "my projects"/"my bookings" views derive from this too,
    since every project and booking hangs off exactly one client.
    """
    assigned_staff_names = serializers.SerializerMethodField()
    assigned_staff = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=User.objects.filter(role="staff")
    )

    class Meta:
        model = Client
        fields = [
            "id", "workspace", "company_name", "contact_email",
            "notes", "is_archived", "assigned_staff",
            "assigned_staff_names", "created_at",
        ]
        read_only_fields = ["workspace"]

    def get_assigned_staff_names(self, obj):
        return [u.first_name for u in obj.assigned_staff.all()]

    def validate_assigned_staff(self, value):
        workspace = self.context["request"].user.get_workspace()
        for staff in value:
            if staff.staff_workspace_id != workspace.id:
                raise serializers.ValidationError(
                    "Can only assign team members from your own "
                    "workspace."
                )
        return value


class ClientSelfSerializer(serializers.ModelSerializer):
    """What a client sees of their own Client record - deliberately
    excludes `notes` (workspace-private) and `is_archived` (not
    the client's concern).
    """
    class Meta:
        model = Client
        fields = ["id", "workspace", "company_name", "contact_email"]
        read_only_fields = fields


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = [
            "id", "name", "price_per_month", "max_clients",
            "max_team_members", "max_projects", "max_bookings_per_month",
            "max_storage_mb",
        ]


class WorkspaceSerializer(serializers.ModelSerializer):
    """plan is nested read-only so the frontend gets the plan's
    name/limits in the same call; changing plans goes through a
    separate action, never a plain PATCH here, so a plan switch
    can be validated against current usage first.
    """
    plan = SubscriptionPlanSerializer(read_only=True)
    client_count = serializers.SerializerMethodField()
    team_member_count = serializers.SerializerMethodField()
    project_count = serializers.SerializerMethodField()
    bookings_this_month_count = serializers.SerializerMethodField()
    storage_used_mb = serializers.SerializerMethodField()
    usage_warnings = serializers.SerializerMethodField()
    stripe_connected = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            "id", "name", "slug", "logo", "currency", "country", "timezone",
            "brand_color", "reminder_hours_before", "plan", "client_count",
            "team_member_count", "project_count", "bookings_this_month_count",
            "storage_used_mb", "usage_warnings", "stripe_connected",
            "public_booking_enabled",
        ]
        read_only_fields = ["id", "slug"]

    def get_client_count(self, obj):
        return obj.clients.count()

    def get_team_member_count(self, obj):
        return obj.team_members.count()

    def get_project_count(self, obj):
        return obj.projects.count()

    def get_bookings_this_month_count(self, obj):
        return obj.bookings_this_month_count()

    def get_storage_used_mb(self, obj):
        return obj.storage_used_mb()

    def get_usage_warnings(self, obj):
        """LIMIT-02: which usage types are at 80%+ of the plan's
        limit, so the frontend can show a warning banner without
        having to duplicate this math against every limit field
        itself. Empty list when there's no plan, no limit set on a
        given type, or usage is comfortably under it.
        """
        plan = obj.plan
        if not plan:
            return []
        warnings = []
        checks = (
            ("clients", plan.max_clients, obj.clients.count()),
            ("team_members", plan.max_team_members, obj.team_members.count()),
            ("projects", plan.max_projects, obj.projects.count()),
            (
                "bookings_this_month", plan.max_bookings_per_month,
                obj.bookings_this_month_count(),
            ),
            ("storage", plan.max_storage_mb, obj.storage_used_mb()),
        )
        for key, limit, used in checks:
            if limit and used / limit >= 0.8:
                warnings.append(key)
        return warnings

    def get_stripe_connected(self, obj):
        # stripe_account_id itself is never exposed to the frontend -
        # it's an internal Stripe identifier, not something any UI
        # needs to display or send back.
        return bool(obj.stripe_account_id)

    def validate_brand_color(self, value):
        import re
        if not re.match(r"^#[0-9A-Fa-f]{6}$", value):
            raise serializers.ValidationError(
                "Must be a hex color like #2563eb."
            )
        return value

    def validate_currency(self, value):
        # Free-typed currencies (e.g. "FCFA" instead of the real ISO
        # code "XAF") are exactly what let a workspace end up with a
        # value Stripe rejects at checkout - after every client's
        # payment silently failed. The frontend now sets this from a
        # Country picker (see portal.currencies), so anything outside
        # that same whitelist is rejected here too.
        value = value.upper()
        if value not in VALID_CURRENCIES:
            raise serializers.ValidationError(
                f"'{value}' isn't a supported currency. Please pick "
                "your country instead of typing a currency code."
            )
        return value


class ChangePlanSerializer(serializers.Serializer):
    """Owner switches plans. Downgrading is blocked if current
    usage already exceeds the new plan's limits - the owner has
    to reduce clients/team first, same as a real billing provider
    would require before letting a downgrade go through.
    """
    plan_id = serializers.PrimaryKeyRelatedField(
        queryset=SubscriptionPlan.objects.all()
    )

    def validate_plan_id(self, value):
        workspace = self.context["workspace"]
        if (
            value.max_clients is not None
            and workspace.clients.count() > value.max_clients
        ):
            raise serializers.ValidationError(
                f"You have more clients than the {value.name} plan "
                f"allows. Remove some clients before switching."
            )
        if (
            value.max_team_members is not None
            and workspace.team_members.count() > value.max_team_members
        ):
            raise serializers.ValidationError(
                f"You have more team members than the {value.name} "
                f"plan allows. Remove some team members before "
                f"switching."
            )
        if (
            value.max_projects is not None
            and workspace.projects.count() > value.max_projects
        ):
            raise serializers.ValidationError(
                f"You have more projects than the {value.name} plan "
                f"allows. Archive or remove some projects before "
                f"switching."
            )
        if (
            value.max_storage_mb is not None
            and workspace.storage_used_mb() > value.max_storage_mb
        ):
            raise serializers.ValidationError(
                f"You're using more storage than the {value.name} "
                f"plan allows. Remove some documents or attachments "
                f"before switching."
            )
        # Bookings-this-month isn't checked here - it's a rolling
        # window that resets every month regardless of plan, so a
        # downgrade today doesn't retroactively invalidate bookings
        # already made this month; it just caps how many more can be
        # made until the month rolls over.
        return value


class RegisterSerializer(serializers.Serializer):
    """Owner sign-up: creates a User (role=owner) and their Workspace
    together, in one request.
    """
    email = serializers.EmailField()
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    full_name = serializers.CharField(max_length=150)
    workspace_name = serializers.CharField(max_length=255)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data["full_name"],
            role=User.Role.OWNER,
        )
        Workspace.objects.create(
            owner=user, name=validated_data["workspace_name"]
        )
        return user


class MeSerializer(serializers.ModelSerializer):
    """What the frontend gets back from GET /api/auth/me/."""

    class Meta:
        model = User
        fields = ["id", "email", "username", "first_name", "role"]


class MeUpdateSerializer(serializers.ModelSerializer):
    """PATCH /api/auth/me/ - self-service profile editing (AUTH-05,
    PORTAL-04). Deliberately excludes username/role/password - a
    changed username would break login by email vs username
    consistency elsewhere, role changes are an owner-only action
    on team members (not self-service), and password changes go
    through ChangePasswordSerializer instead so the current
    password can be verified first.
    """

    class Meta:
        model = User
        fields = ["first_name", "email"]

    def validate_email(self, value):
        if (
            User.objects.filter(email__iexact=value)
            .exclude(pk=self.instance.pk)
            .exists()
        ):
            raise serializers.ValidationError(
                "An account with this email already exists."
            )
        return value


class ChangePasswordSerializer(serializers.Serializer):
    """POST /api/auth/change-password/ - requires the current
    password so a hijacked, still-logged-in session can't be used
    to lock the real owner out by silently swapping the password.
    """
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["user"]
        if not user.check_password(value):
            raise serializers.ValidationError(
                "Current password is incorrect."
            )
        return value


class DeleteAccountSerializer(serializers.Serializer):
    """POST /api/auth/delete-account/ - same reasoning as
    ChangePasswordSerializer: an irreversible action needs the
    current password re-entered, not just an active session.
    """
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        user = self.context["user"]
        if not user.check_password(value):
            raise serializers.ValidationError("Password is incorrect.")
        return value


class ClientInviteCreateSerializer(serializers.ModelSerializer):
    """Owner creates an invite for a client. Used by
    POST /api/invites/.
    """

    class Meta:
        model = ClientInvite
        fields = [
            "id", "email", "company_name", "created_at",
            "accepted", "expires_at",
        ]
        read_only_fields = ["id", "created_at", "accepted", "expires_at"]


class AcceptInviteSerializer(serializers.Serializer):
    """Client uses their invite token + sets a password to create
    their account. Used by POST /api/auth/accept-invite/.
    """
    token = serializers.UUIDField()
    password = serializers.CharField(write_only=True, min_length=8)
    full_name = serializers.CharField(max_length=150)

    def validate_token(self, value):
        try:
            invite = ClientInvite.objects.get(token=value)
        except ClientInvite.DoesNotExist:
            raise serializers.ValidationError("Invalid invite link.")
        if not invite.is_valid():
            raise serializers.ValidationError(
                "This invite has expired or was already used."
            )
        self.invite = invite
        return value

    def create(self, validated_data):
        invite = self.invite
        user = User.objects.create_user(
            username=invite.email,
            email=invite.email,
            password=validated_data["password"],
            first_name=validated_data["full_name"],
            role=User.Role.CLIENT,
        )
        client = Client.objects.create(
            workspace=invite.workspace,
            user=user,
            company_name=invite.company_name,
            contact_email=invite.email,
        )
        invite.accepted = True
        invite.save(update_fields=["accepted"])
        return client


class TeamInviteCreateSerializer(serializers.ModelSerializer):
    """Owner invites a team member by email. Used by
    POST /api/team-invites/.
    """

    class Meta:
        model = TeamInvite
        fields = ["id", "email", "created_at", "accepted", "expires_at"]
        read_only_fields = ["id", "created_at", "accepted", "expires_at"]

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )
        return value


class AcceptTeamInviteSerializer(serializers.Serializer):
    """Invited team member uses their token + sets a password to
    create their staff account. Used by
    POST /api/auth/accept-team-invite/.
    """
    token = serializers.UUIDField()
    password = serializers.CharField(write_only=True, min_length=8)
    full_name = serializers.CharField(max_length=150)

    def validate_token(self, value):
        try:
            invite = TeamInvite.objects.get(token=value)
        except TeamInvite.DoesNotExist:
            raise serializers.ValidationError("Invalid invite link.")
        if not invite.is_valid():
            raise serializers.ValidationError(
                "This invite has expired or was already used."
            )
        self.invite = invite
        return value

    def create(self, validated_data):
        invite = self.invite
        user = User.objects.create_user(
            username=invite.email,
            email=invite.email,
            password=validated_data["password"],
            first_name=validated_data["full_name"],
            role=User.Role.STAFF,
            staff_workspace=invite.workspace,
        )
        invite.accepted = True
        invite.save(update_fields=["accepted"])
        return user


class TeamMemberSerializer(serializers.ModelSerializer):
    """Read-only view of a team member for the owner's team list,
    except `restricted` (TEAM-02), which the owner can toggle via
    PATCH /api/team/<id>/ to scope that person to only the clients
    they're assigned to (see permissions.staff_scope) instead of
    the whole workspace.
    """

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "restricted"]
        read_only_fields = ["id", "email", "first_name"]


class MilestoneSerializer(serializers.ModelSerializer):
    """Read/write for a single milestone within a project."""

    class Meta:
        model = Milestone
        fields = [
            "id", "project", "title", "order",
            "is_complete", "completed_at",
        ]
        read_only_fields = ["completed_at"]

    def update(self, instance, validated_data):
        turning_complete = (
            validated_data.get("is_complete") and not instance.is_complete
        )
        if turning_complete:
            validated_data["completed_at"] = timezone.now()
        if validated_data.get("is_complete") is False:
            validated_data["completed_at"] = None
        return super().update(instance, validated_data)


class TaskSerializer(serializers.ModelSerializer):
    """Handles completion timestamps the same way
    MilestoneSerializer does.
    """

    class Meta:
        model = Task
        fields = [
            "id", "project", "milestone", "title", "description",
            "due_date", "is_complete", "completed_at", "order",
            "created_at",
        ]
        read_only_fields = ["completed_at", "created_at"]

    def update(self, instance, validated_data):
        turning_complete = (
            validated_data.get("is_complete")
            and not instance.is_complete
        )
        if turning_complete:
            validated_data["completed_at"] = timezone.now()
        if validated_data.get("is_complete") is False:
            validated_data["completed_at"] = None
        return super().update(instance, validated_data)


class ApprovalSerializer(serializers.ModelSerializer):
    """Owner creates/reads approvals. Clients use a separate
    action (ApprovalDecisionSerializer below) to record their
    decision, so a client can never edit the title/description
    of a request they're deciding on.
    """

    class Meta:
        model = Approval
        fields = [
            "id", "project", "title", "description", "status",
            "client_comment", "created_at", "decided_at",
        ]
        read_only_fields = [
            "status", "client_comment", "created_at", "decided_at",
        ]


class ApprovalDecisionSerializer(serializers.Serializer):
    """Client's decision on a pending approval."""
    status = serializers.ChoiceField(
        choices=["approved", "changes_requested"]
    )
    client_comment = serializers.CharField(
        required=False, allow_blank=True
    )


class ProjectSerializer(serializers.ModelSerializer):
    """Includes nested milestones and a computed progress percent, so
    the frontend gets everything it needs for a project card/page in
    one request.
    """
    milestones = MilestoneSerializer(many=True, read_only=True)
    progress_percent = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id", "workspace", "client", "client_name", "name",
            "budget", "start_date", "deadline", "status",
            "created_at", "milestones", "progress_percent",
        ]
        read_only_fields = ["workspace"]

    def get_progress_percent(self, obj):
        return obj.progress_percent()

    def get_client_name(self, obj):
        return obj.client.company_name


class DocumentSerializer(serializers.ModelSerializer):
    """Read/write for a project document. `uploaded_by_name` is
    derived so the frontend doesn't need a second lookup to show
    who uploaded a file. `file` is write-only (upload input only) -
    the storage backend's own URL is never sent to the client
    (SEC-03): it's a permanent, unauthenticated Cloudinary link that
    would otherwise leak into API responses/browser history forever,
    bypassing the is_private check the moment it's copied elsewhere.
    `file_url` instead points at DocumentViewSet.file_view, which
    re-checks visibility (and logs the ACT-02 read receipt) on every
    single fetch.
    """
    uploaded_by_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id", "project", "file", "file_url", "original_name",
            "category", "is_private", "size_bytes", "uploaded_at",
            "uploaded_by_name",
        ]
        read_only_fields = [
            "original_name", "size_bytes", "uploaded_at",
        ]
        extra_kwargs = {"file": {"write_only": True}}

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.first_name
        return None

    def get_file_url(self, obj):
        # Relative, not request.build_absolute_uri() - the frontend's
        # api client already targets its own configured API base URL,
        # so this just needs to match the same relative-path
        # convention every other endpoint in this API uses.
        return f"/documents/{obj.pk}/file/"


class MessageSerializer(serializers.ModelSerializer):
    """Includes the sender's name and role, derived so the frontend
    can render "you" vs "them" bubbles without a second lookup.
    `attachment` is write-only for the same reason as Document.file
    (SEC-03) - `attachment_url` points at MessageViewSet.attachment_
    view instead, which re-checks the requester still has access to
    this project on every fetch rather than handing out a permanent
    unauthenticated link.
    """
    sender_name = serializers.SerializerMethodField()
    sender_role = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "project", "body", "created_at",
            "sender_name", "sender_role",
            "attachment", "attachment_url", "attachment_name",
            "attachment_size_bytes",
        ]
        read_only_fields = [
            "created_at", "attachment_name", "attachment_size_bytes",
        ]
        extra_kwargs = {
            "attachment": {"required": False, "write_only": True},
        }

    def get_sender_name(self, obj):
        if obj.sender:
            return obj.sender.first_name
        return "Deleted user"

    def get_sender_role(self, obj):
        if obj.sender:
            return obj.sender.role
        return None

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        return f"/messages/{obj.pk}/attachment/"

    def validate(self, attrs):
        body = attrs.get("body", "") or (
            self.instance.body if self.instance else ""
        )
        attachment = attrs.get("attachment") or (
            self.instance.attachment if self.instance else None
        )
        if not body and not attachment:
            raise serializers.ValidationError(
                "A message needs a body or an attachment."
            )
        return attrs


class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = ["id", "description", "amount"]


class InvoiceSerializer(serializers.ModelSerializer):
    """Items are nested and written together with the invoice in a
    single request, so the frontend never has to make separate
    calls to build up an invoice's line items.
    """
    items = InvoiceItemSerializer(many=True)
    total = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id", "workspace", "client", "client_name", "project",
            "number", "status", "issued_at", "due_at", "paid_at",
            "items", "total",
        ]
        read_only_fields = ["workspace"]

    def get_total(self, obj):
        return sum(
            (item.amount for item in obj.items.all()), start=0
        )

    def get_client_name(self, obj):
        return obj.client.company_name

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        invoice = Invoice.objects.create(**validated_data)
        for item in items_data:
            InvoiceItem.objects.create(invoice=invoice, **item)
        return invoice

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        instance = super().update(instance, validated_data)
        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                InvoiceItem.objects.create(
                    invoice=instance, **item
                )
        return instance


class ServiceQuestionSerializer(serializers.ModelSerializer):
    """A custom intake question on a service (BOOK-69). choices is a
    plain comma-separated string in both directions - simple enough
    for an owner to type/edit directly with no add/remove-chip UI,
    and only meaningful at all when question_type is 'choice'.
    """

    class Meta:
        model = ServiceQuestion
        fields = [
            "id", "workspace", "service", "text", "question_type",
            "choices", "required", "order",
        ]
        read_only_fields = ["workspace"]

    def validate(self, attrs):
        question_type = attrs.get(
            "question_type",
            self.instance.question_type if self.instance else "text",
        )
        choices = attrs.get(
            "choices", self.instance.choices if self.instance else ""
        )
        if question_type == "choice" and not choices.strip():
            raise serializers.ValidationError(
                "Provide at least one comma-separated choice for a "
                "multiple-choice question."
            )
        return attrs

    def validate_service(self, value):
        workspace = self.context["request"].user.get_workspace()
        if value.workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only add questions to a service in your own "
                "workspace."
            )
        return value


class LocationSerializer(serializers.ModelSerializer):
    """Full CRUD for a workspace's physical locations (BOOK-06).
    Services/Resources/WorkingHours/BlockedTime each optionally link
    to one - see their own serializers for how.
    """

    class Meta:
        model = Location
        fields = [
            "id", "workspace", "name", "address", "phone", "is_active",
            "created_at",
        ]
        read_only_fields = ["workspace", "created_at"]


class ServiceSerializer(serializers.ModelSerializer):
    resource_names = serializers.SerializerMethodField()
    staff_names = serializers.SerializerMethodField()
    location_name = serializers.SerializerMethodField()
    questions = ServiceQuestionSerializer(many=True, read_only=True)
    staff = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=User.objects.filter(role="staff")
    )
    location_ref = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Service
        fields = [
            "id", "workspace", "name", "description", "photo",
            "duration_minutes", "price", "capacity", "is_active",
            "location", "location_ref", "location_name", "is_online",
            "meeting_link", "instructions",
            "resource_names", "staff", "staff_names", "questions",
            "payment_requirement", "deposit_percent",
            "cancellation_notice_hours", "late_cancellation_fee_percent",
            "buffer_before_minutes", "buffer_after_minutes",
            "min_notice_hours", "max_advance_days",
            "max_bookings_per_day", "max_bookings_per_week",
        ]
        read_only_fields = ["workspace"]

    def get_resource_names(self, obj):
        return [r.name for r in obj.resources.all()]

    def get_staff_names(self, obj):
        return [u.first_name for u in obj.staff.all()]

    def get_location_name(self, obj):
        return obj.location_ref.name if obj.location_ref else None

    def validate_location_ref(self, value):
        if value is None:
            return value
        workspace = self.context["request"].user.get_workspace()
        if value.workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only use a location from your own workspace."
            )
        return value

    def validate_staff(self, value):
        user = self.context["request"].user
        if not value:
            return value
        if user.role not in ("owner", "staff"):
            raise serializers.ValidationError(
                "Only the workspace owner or a team member can assign "
                "staff to a service."
            )
        workspace = user.get_workspace()
        for staff in value:
            if staff.staff_workspace_id != workspace.id:
                raise serializers.ValidationError(
                    "Can only assign team members from your own "
                    "workspace."
                )
        return value

    def validate(self, attrs):
        requirement = attrs.get(
            "payment_requirement",
            self.instance.payment_requirement if self.instance else "none",
        )
        deposit_percent = attrs.get(
            "deposit_percent",
            self.instance.deposit_percent if self.instance else None,
        )
        if requirement == "deposit" and not deposit_percent:
            raise serializers.ValidationError(
                "deposit_percent is required when payment_requirement "
                "is 'deposit'."
            )
        if deposit_percent is not None and not (0 < deposit_percent <= 100):
            raise serializers.ValidationError(
                "deposit_percent must be between 1 and 100."
            )
        fee_percent = attrs.get(
            "late_cancellation_fee_percent",
            self.instance.late_cancellation_fee_percent
            if self.instance
            else None,
        )
        if fee_percent is not None and not (0 < fee_percent <= 100):
            raise serializers.ValidationError(
                "late_cancellation_fee_percent must be between 1 and "
                "100."
            )
        return attrs


class ResourceSerializer(serializers.ModelSerializer):
    """Full CRUD for a bookable resource. `services` is a list of
    service IDs this resource is tied to - a booking for any of
    those services reserves one unit of this resource for its
    time slot (superseded per-service by ServiceResourceRequirement
    rows when any exist, see service_resource_requirements()).
    `duration_minutes` is the slot length used when this resource
    is booked directly, without a service - can span multiple days
    (e.g. booking a room for a week) with no upper limit; `price`
    is optional and, since the Resource Reservation System, is
    interpreted per `pricing_mode` and folded into the booking's
    payment_amount (see BookingSerializer._apply_resource_plan).
    `type`/`reservation_mode`/`status`/`capacity_mode` are all
    plain choice fields - see the Resource model's own docstring
    for what each controls.
    """

    type_display = serializers.CharField(
        source="get_type_display", read_only=True
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )
    location_name = serializers.SerializerMethodField()
    location_ref = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Resource
        fields = [
            "id", "workspace", "name", "description", "photo",
            "quantity", "price", "duration_minutes", "services",
            "created_at",
            "type", "type_display", "custom_type", "category", "location",
            "location_ref", "location_name",
            "status", "status_display", "reservation_mode", "pricing_mode",
            "capacity", "capacity_mode",
            "booking_buffer_before_minutes", "booking_buffer_after_minutes",
            "min_booking_notice_hours", "max_advance_days",
            "min_duration_minutes", "max_duration_minutes", "extra_rules",
        ]
        read_only_fields = ["workspace", "created_at"]

    def get_location_name(self, obj):
        return obj.location_ref.name if obj.location_ref else None

    def validate_location_ref(self, value):
        if value is None:
            return value
        workspace = self.context["request"].user.get_workspace()
        if value.workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only use a location from your own workspace."
            )
        return value

    def validate_duration_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "Duration must be at least 1 minute."
            )
        return value

    def validate(self, attrs):
        resource_type = attrs.get(
            "type", self.instance.type if self.instance else None
        )
        custom_type = attrs.get(
            "custom_type", self.instance.custom_type if self.instance else ""
        )
        if resource_type == Resource.ResourceType.CUSTOM and not custom_type:
            raise serializers.ValidationError(
                {"custom_type": "Required when type is \"Custom\"."}
            )
        return attrs


class ResourceAvailabilitySerializer(serializers.ModelSerializer):
    """Per-resource weekly working hours (BOOK-57/58) - structurally
    the same idea as WorkingHoursSerializer, scoped to a resource
    instead of a staff member. No rows for a resource means it's
    bookable the full 24h day (see resource_availability.py).
    """
    resource_name = serializers.SerializerMethodField()
    resource = serializers.PrimaryKeyRelatedField(
        queryset=Resource.objects.all()
    )

    class Meta:
        model = ResourceAvailability
        fields = [
            "id", "workspace", "resource", "resource_name", "weekday",
            "start_time", "end_time",
        ]
        read_only_fields = ["workspace"]

    def get_resource_name(self, obj):
        return obj.resource.name

    def validate_resource(self, value):
        workspace = self.context["request"].user.get_workspace()
        if value.workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only set hours for a resource in your own "
                "workspace."
            )
        return value

    def validate(self, attrs):
        start = attrs.get(
            "start_time", self.instance.start_time if self.instance else None
        )
        end = attrs.get(
            "end_time", self.instance.end_time if self.instance else None
        )
        if start and end and end <= start:
            raise serializers.ValidationError(
                "End time must be after start time."
            )
        return attrs


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = [
            "id", "workspace", "name", "account_details", "created_at",
        ]
        read_only_fields = ["workspace", "created_at"]


class WorkingHoursSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()
    location_name = serializers.SerializerMethodField()
    staff = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role="staff"),
        required=False,
        allow_null=True,
    )
    location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = WorkingHours
        fields = [
            "id", "workspace", "staff", "staff_name", "location",
            "location_name", "weekday", "start_time", "end_time",
        ]
        read_only_fields = ["workspace"]

    def get_staff_name(self, obj):
        return obj.staff.first_name if obj.staff else None

    def get_location_name(self, obj):
        return obj.location.name if obj.location else None

    def validate_staff(self, value):
        if value is None:
            return value
        workspace = self.context["request"].user.get_workspace()
        if value.staff_workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only set hours for a team member in your own "
                "workspace."
            )
        return value

    def validate_location(self, value):
        if value is None:
            return value
        workspace = self.context["request"].user.get_workspace()
        if value.workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only set hours for a location in your own "
                "workspace."
            )
        return value

    def validate(self, attrs):
        staff = attrs.get(
            "staff", self.instance.staff if self.instance else None
        )
        location = attrs.get(
            "location", self.instance.location if self.instance else None
        )
        if staff and location:
            raise serializers.ValidationError(
                "Hours can be scoped to a team member or a location, "
                "not both."
            )
        return attrs


class BlockedTimeSerializer(serializers.ModelSerializer):
    """A holiday (BOOK-11, staff/resource/location all left blank), a
    specific staff block (BOOK-12, staff set), a resource block
    (BOOK-60, resource set - maintenance/cleaning/repair/private
    use), or a location block (BOOK-06, location set - closed for a
    holiday, renovation, or private event) - AvailabilityView and
    booking creation all treat any overlapping row as fully
    unavailable, regardless of working/resource hours. At most one
    of `staff`/`resource`/`location` is ever set.
    """
    staff_name = serializers.SerializerMethodField()
    resource_name = serializers.SerializerMethodField()
    location_name = serializers.SerializerMethodField()
    staff = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role="staff"),
        required=False,
        allow_null=True,
    )
    resource = serializers.PrimaryKeyRelatedField(
        queryset=Resource.objects.all(), required=False, allow_null=True
    )
    location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = BlockedTime
        fields = [
            "id", "workspace", "staff", "staff_name", "resource",
            "resource_name", "location", "location_name", "block_type",
            "start_time", "end_time", "reason", "created_at",
        ]
        read_only_fields = ["workspace", "created_at"]

    def get_staff_name(self, obj):
        return obj.staff.first_name if obj.staff else None

    def get_resource_name(self, obj):
        return obj.resource.name if obj.resource else None

    def get_location_name(self, obj):
        return obj.location.name if obj.location else None

    def validate_staff(self, value):
        if value is None:
            return value
        workspace = self.context["request"].user.get_workspace()
        if value.staff_workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only block time for a team member in your own "
                "workspace."
            )
        return value

    def validate_resource(self, value):
        if value is None:
            return value
        workspace = self.context["request"].user.get_workspace()
        if value.workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only block a resource in your own workspace."
            )
        return value

    def validate_location(self, value):
        if value is None:
            return value
        workspace = self.context["request"].user.get_workspace()
        if value.workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only block a location in your own workspace."
            )
        return value

    def validate(self, attrs):
        start = attrs.get(
            "start_time", self.instance.start_time if self.instance else None
        )
        end = attrs.get(
            "end_time", self.instance.end_time if self.instance else None
        )
        if start and end and end <= start:
            raise serializers.ValidationError(
                "End time must be after start time."
            )
        staff = attrs.get(
            "staff", self.instance.staff if self.instance else None
        )
        resource = attrs.get(
            "resource", self.instance.resource if self.instance else None
        )
        location = attrs.get(
            "location", self.instance.location if self.instance else None
        )
        if sum(bool(x) for x in (staff, resource, location)) > 1:
            raise serializers.ValidationError(
                "A block can target a team member, a resource, or a "
                "location, not more than one."
            )
        return attrs


class ServiceResourceRequirementSerializer(serializers.ModelSerializer):
    """BOOK-72: an explicit required/optional/alternative resource
    requirement for a service - see the model's own docstring for
    the fallback-to-legacy-M2M behavior when a service has none of
    these rows.
    """
    resource_name = serializers.SerializerMethodField()
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all())
    resource = serializers.PrimaryKeyRelatedField(
        queryset=Resource.objects.all()
    )

    class Meta:
        model = ServiceResourceRequirement
        fields = [
            "id", "service", "resource", "resource_name",
            "requirement_type", "alternative_group", "quantity",
        ]

    def get_resource_name(self, obj):
        return obj.resource.name

    def _workspace(self):
        return self.context["request"].user.get_workspace()

    def validate_service(self, value):
        if value.workspace_id != self._workspace().id:
            raise serializers.ValidationError(
                "Can only set requirements for a service in your "
                "own workspace."
            )
        return value

    def validate_resource(self, value):
        if value.workspace_id != self._workspace().id:
            raise serializers.ValidationError(
                "Can only require a resource from your own workspace."
            )
        return value


class ResourceReservationSerializer(serializers.ModelSerializer):
    """Read-only: a ResourceReservation is only ever created as a
    side effect of a booking being confirmed (see BookingSerializer.
    _apply_resource_plan) - this just exposes the resulting rows for
    the resource calendar/filter views (BOOK-82..86).
    """
    resource_name = serializers.SerializerMethodField()
    booking_start_time = serializers.DateTimeField(
        source="booking.start_time", read_only=True
    )
    booking_end_time = serializers.DateTimeField(
        source="booking.end_time", read_only=True
    )
    booking_status = serializers.CharField(
        source="booking.status", read_only=True
    )
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = ResourceReservation
        fields = [
            "id", "workspace", "booking", "resource", "resource_name",
            "requirement_type", "quantity", "party_size", "created_at",
            "booking_start_time", "booking_end_time", "booking_status",
            "client_name",
        ]
        read_only_fields = fields

    def get_resource_name(self, obj):
        return obj.resource.name

    def get_client_name(self, obj):
        return obj.booking.client.company_name


class ResourceRentalPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceRentalPolicy
        fields = [
            "id", "resource", "rental_unit", "min_rental_duration_minutes",
            "max_rental_duration_minutes", "deposit_required",
            "deposit_amount", "late_fee_per_hour", "allow_recurring",
            "cancellation_notice_hours", "reschedule_notice_hours",
            "extra_rules",
        ]

    def validate_resource(self, value):
        workspace = self.context["request"].user.get_workspace()
        if value.workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only configure a rental policy for a resource "
                "in your own workspace."
            )
        return value


class ResourceRentalSerializer(serializers.ModelSerializer):
    """Read-only except for the check-in/check-out/mark-overdue
    actions on ResourceRentalViewSet - a ResourceRental is created
    implicitly whenever a RENTAL-mode resource is booked (see
    BookingSerializer._apply_resource_plan), never directly through
    this serializer.
    """
    resource_name = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    checked_out_by_name = serializers.SerializerMethodField()
    checked_in_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ResourceRental
        fields = [
            "id", "booking", "resource_reservation", "resource_name",
            "client_name", "rental_status", "deposit_status",
            "deposit_amount", "checked_out_at", "checked_out_by",
            "checked_out_by_name", "checked_in_at", "checked_in_by",
            "checked_in_by_name", "condition_notes_out",
            "condition_notes_in", "recurring_series", "created_at",
        ]
        read_only_fields = [
            "booking", "resource_reservation", "checked_out_at",
            "checked_out_by", "checked_in_at", "checked_in_by",
            "created_at",
        ]

    def get_resource_name(self, obj):
        return obj.resource_reservation.resource.name

    def get_client_name(self, obj):
        return obj.booking.client.company_name

    def get_checked_out_by_name(self, obj):
        return obj.checked_out_by.first_name if obj.checked_out_by else None

    def get_checked_in_by_name(self, obj):
        return obj.checked_in_by.first_name if obj.checked_in_by else None


class BookingSerializer(serializers.ModelSerializer):
    """Owner creates bookings for any of their clients; clients
    create bookings for themselves only (client is forced server
    -side in the view, never trusted from the request body).
    client is required=False here because clients booking for
    themselves never send it - the view fills it in. Exactly one
    of service or resource must be provided: a service booking
    checks the service's own capacity AND every resource tied to
    it; a resource booking (no service) checks that resource's
    own quantity directly, using the resource's own
    duration_minutes for the slot length. Either way the booking
    can never be confirmed if the relevant capacity is exhausted.
    """
    service_name = serializers.SerializerMethodField()
    service_location = serializers.SerializerMethodField()
    service_is_online = serializers.SerializerMethodField()
    service_meeting_link = serializers.SerializerMethodField()
    resource_name = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    staff_name = serializers.SerializerMethodField()
    remaining_capacity = serializers.SerializerMethodField()
    client = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(), required=False
    )
    service = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.all(), required=False, allow_null=True
    )
    resource = serializers.PrimaryKeyRelatedField(
        queryset=Resource.objects.all(), required=False, allow_null=True
    )
    resource_ids = serializers.PrimaryKeyRelatedField(
        queryset=Resource.objects.all(),
        many=True,
        required=False,
        write_only=True,
        help_text="BOOK-71: reserve several resources directly in "
        "one booking (no service), e.g. 2 chairs + 1 table. Ignored "
        "when `service` or the legacy `resource` field is set.",
    )
    staff = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role="staff"),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Booking
        fields = [
            "id", "workspace", "service", "service_name",
            "service_location", "service_is_online",
            "service_meeting_link", "resource", "resource_ids",
            "resource_name", "client",
            "client_name", "staff", "staff_name", "series", "start_time",
            "end_time", "status", "notes", "created_at",
            "remaining_capacity", "payment_status", "payment_amount",
            "is_late_cancellation", "custom_answers",
        ]
        read_only_fields = [
            "workspace", "end_time", "payment_status", "payment_amount",
            "is_late_cancellation",
        ]

    def validate_resource_ids(self, value):
        if not value:
            return value
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            # The guest-facing PublicBookingSerializer has no
            # request.user to scope by - multi-resource booking is
            # an authenticated-only capability for now, matching the
            # legacy singular `resource` field's own guest support
            # (one resource at a time, no scoping issue there since
            # PublicBookingSerializer.validate() checks it directly).
            raise serializers.ValidationError(
                "Multiple resources can only be reserved when signed in."
            )
        user = request.user
        workspace = (
            user.get_workspace()
            if user.role in ("owner", "staff")
            else user.client_profile.workspace
        )
        for res in value:
            if res.workspace_id != workspace.id:
                raise serializers.ValidationError(
                    "Can only reserve resources from your own workspace."
                )
        return value

    def get_staff_name(self, obj):
        return obj.staff.first_name if obj.staff else None

    def validate_staff(self, value):
        # A client picks from the service's own staff list (BOOK-19)
        # rather than being blocked from setting this at all - the
        # object-level validate() below is what actually enforces
        # "only a team member qualified for this service", uniformly
        # for owner/staff and client bookings alike.
        if value is None:
            return value
        user = self.context["request"].user
        workspace = (
            user.get_workspace()
            if user.role in ("owner", "staff")
            else user.client_profile.workspace
        )
        if value.staff_workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only assign a team member from your own workspace."
            )
        return value

    def get_service_name(self, obj):
        return obj.service.name if obj.service else None

    def get_service_location(self, obj):
        return obj.service.location if obj.service else ""

    def get_service_is_online(self, obj):
        return obj.service.is_online if obj.service else False

    def get_service_meeting_link(self, obj):
        return obj.service.meeting_link if obj.service else ""

    def get_resource_name(self, obj):
        if obj.resource:
            return obj.resource.name
        names = [rr.resource.name for rr in obj.resource_reservations.all()]
        return ", ".join(names) if names else None

    def get_client_name(self, obj):
        return obj.client.company_name

    def get_remaining_capacity(self, obj):
        if obj.service:
            taken = Booking.objects.filter(
                workspace=obj.workspace,
                service=obj.service,
                status="confirmed",
                start_time=obj.start_time,
            ).count()
            return max(obj.service.capacity - taken, 0)
        if not obj.resource:
            # A multi-resource booking (BOOK-71) has no single legacy
            # `resource` FK to report a scalar capacity for.
            return None
        taken = Booking.objects.filter(
            workspace=obj.workspace,
            resource=obj.resource,
            status="confirmed",
            start_time=obj.start_time,
        ).count()
        return max(obj.resource.quantity - taken, 0)

    def validate(self, attrs):
        from datetime import timedelta

        service = attrs.get(
            "service", self.instance.service if self.instance else None
        )
        resource = attrs.get(
            "resource", self.instance.resource if self.instance else None
        )
        # BOOK-71: resource_ids is an alternative to the legacy
        # singular `resource` field for reserving several resources
        # directly (no service) in one booking - write-only, so on
        # update it's only present in attrs when the client actually
        # sent a new set this time.
        resource_ids = attrs.get("resource_ids")
        start = attrs.get("start_time") or self.instance.start_time

        if not service and not resource and not resource_ids:
            raise serializers.ValidationError(
                "Either a service or a resource must be selected."
            )
        if service and (resource or resource_ids):
            raise serializers.ValidationError(
                "Choose either a service or a resource, not both."
            )

        if not self.instance and start < timezone.now():
            raise serializers.ValidationError(
                "You cannot book a time in the past."
            )

        staff = attrs.get(
            "staff", self.instance.staff if self.instance else None
        )
        if staff and service and service.staff.exists() and staff not in service.staff.all():
            raise serializers.ValidationError(
                "This team member does not perform this service."
            )

        new_status = attrs.get("status")
        request = self.context.get("request")
        if (
            self.instance
            and new_status
            and new_status != self.instance.status
            and request
            and request.user.role == "client"
            and new_status != "cancelled"
        ):
            raise serializers.ValidationError(
                "You can only cancel your own booking. Other status "
                "changes are made by the business."
            )

        if (
            self.instance
            and new_status == "cancelled"
            and self.instance.status != "cancelled"
            and self.instance.service
            and self.instance.service.late_cancellation_fee_percent
        ):
            notice = timedelta(
                hours=self.instance.service.cancellation_notice_hours
            )
            if timezone.now() > self.instance.start_time - notice:
                attrs["is_late_cancellation"] = True

        # BOOK-40: a client rescheduling their own booking is held to
        # the same notice window as cancelling it - the business
        # still loses the slot on short notice either way. Owner/
        # staff are exempt since they're the ones who'd manually
        # rearrange a schedule on the business's own terms.
        if (
            self.instance
            and "start_time" in attrs
            and self.instance.service
            and request
            and request.user.role == "client"
        ):
            notice = timedelta(
                hours=self.instance.service.cancellation_notice_hours
            )
            if timezone.now() > self.instance.start_time - notice:
                raise serializers.ValidationError(
                    "This booking can no longer be rescheduled - it "
                    "requires at least "
                    f"{self.instance.service.cancellation_notice_hours} "
                    "hour(s) notice."
                )

        if service:
            attrs["end_time"] = start + timedelta(
                minutes=service.duration_minutes
            )
            end = attrs["end_time"]

            # BOOK-69/70: intake questions are only asked once, at
            # booking time - re-validating them on every later save
            # (e.g. marking an old booking completed) would fail for
            # no reason against answers that were already accepted.
            if not self.instance:
                answers = attrs.get("custom_answers") or {}
                for question in service.questions.all():
                    answer = str(answers.get(str(question.id), "")).strip()
                    if question.required and not answer:
                        raise serializers.ValidationError(
                            f"'{question.text}' is required."
                        )
                    if (
                        question.question_type == "choice"
                        and answer
                        and answer not in question.choice_list()
                    ):
                        raise serializers.ValidationError(
                            f"'{answer}' is not a valid choice for "
                            f"'{question.text}'."
                        )

            # Notice window, advance-booking window, holidays/blocked
            # time, and daily/weekly caps (BOOK-14/15/11/12/16) only
            # need re-checking when start_time is actually being set
            # (a fresh booking, or an explicit reschedule) - re-
            # running them against an unchanged, now-historical
            # start_time on an unrelated status update (e.g. marking
            # an old booking completed) would fail for no reason.
            if not self.instance or "start_time" in attrs:
                if start < timezone.now() + timedelta(
                    hours=service.min_notice_hours
                ):
                    raise serializers.ValidationError(
                        f"This service requires at least "
                        f"{service.min_notice_hours} hour(s) notice."
                    )
                if service.max_advance_days is not None:
                    latest = timezone.now().date() + timedelta(
                        days=service.max_advance_days
                    )
                    if start.date() > latest:
                        raise serializers.ValidationError(
                            "This service can only be booked up to "
                            f"{service.max_advance_days} day(s) in "
                            "advance."
                        )

                blocked = BlockedTime.objects.filter(
                    workspace=service.workspace,
                    start_time__lt=end,
                    end_time__gt=start,
                )
                # Mirrors compute_service_availability's blocked_qs
                # scoping exactly - a resource-specific block is
                # never relevant here, and a location-specific block
                # only applies when this service is tied to that
                # location.
                scope = Q(
                    staff__isnull=True, resource__isnull=True,
                    location__isnull=True,
                )
                if staff:
                    scope |= Q(staff=staff)
                if service.location_ref_id:
                    scope |= Q(location=service.location_ref)
                blocked = blocked.filter(scope)
                if blocked.exists():
                    raise serializers.ValidationError(
                        "This time is unavailable."
                    )

                if service.max_bookings_per_day is not None:
                    day_count = Booking.objects.filter(
                        workspace=service.workspace,
                        service=service,
                        status="confirmed",
                        start_time__date=start.date(),
                    ).exclude(
                        pk=self.instance.pk if self.instance else None
                    ).count()
                    if day_count >= service.max_bookings_per_day:
                        raise serializers.ValidationError(
                            "This service has reached its maximum "
                            "bookings for that day."
                        )
                if service.max_bookings_per_week is not None:
                    week_start = start.date() - timedelta(
                        days=start.weekday()
                    )
                    week_end = week_start + timedelta(days=7)
                    week_count = Booking.objects.filter(
                        workspace=service.workspace,
                        service=service,
                        status="confirmed",
                        start_time__date__gte=week_start,
                        start_time__date__lt=week_end,
                    ).exclude(
                        pk=self.instance.pk if self.instance else None
                    ).count()
                    if week_count >= service.max_bookings_per_week:
                        raise serializers.ValidationError(
                            "This service has reached its maximum "
                            "bookings for that week."
                        )

            if (
                not self.instance
                and service.payment_requirement != "none"
                and service.price
            ):
                percent = (
                    service.deposit_percent
                    if service.payment_requirement == "deposit"
                    else 100
                ) or 100
                attrs["payment_amount"] = (
                    service.price * percent / 100
                ).quantize(Decimal("0.01"))
                attrs["payment_status"] = "pending"
            # An existing booking's own buffer_before/buffer_after
            # (BOOK-13) widens the window nothing else may start in
            # before it or end in after it - so a new booking that
            # starts too soon before, or would still be running too
            # close after, an existing one is rejected.
            buffer_before = timedelta(
                minutes=service.buffer_before_minutes
            )
            buffer_after = timedelta(minutes=service.buffer_after_minutes)
            overlapping = Booking.objects.filter(
                workspace=service.workspace,
                service=service,
                status="confirmed",
                start_time__lt=attrs["end_time"] + buffer_before,
                end_time__gt=start - buffer_after,
            )
            if self.instance:
                overlapping = overlapping.exclude(pk=self.instance.pk)
            if overlapping.count() >= service.capacity:
                raise serializers.ValidationError(
                    "This time slot is fully booked."
                )

            # A booking for this service also reserves whatever
            # resources it requires (BOOK-72/73: required/optional/
            # alternative) - if a required one (or every candidate
            # in an alternative group) is already at capacity for
            # this window, the booking can't be confirmed either.
            # This is the same fast, advisory check
            # _plan_resource_reservations() re-runs under lock in
            # create()/update() - see that method's docstring.
            self._plan_resource_reservations(
                service=service,
                resource=None,
                resource_ids=None,
                start=start,
                end=attrs["end_time"],
                exclude_pk=self.instance.pk if self.instance else None,
            )
        else:
            resources = resource_ids or ([resource] if resource else [])
            # A direct (no-service) resource booking uses the first
            # resource's own duration for the slot length - matches
            # the pre-multi-resource behavior exactly when there's
            # only one; resource_ids beyond the first don't lengthen
            # or shorten the shared window.
            attrs["end_time"] = start + timedelta(
                minutes=resources[0].duration_minutes
            )
            for res in resources:
                if res.reservation_mode == Resource.ReservationMode.BOOKING:
                    raise serializers.ValidationError(
                        f'"{res.name}" can only be booked as part of '
                        "a service."
                    )
                if not resource_is_bookable(res):
                    raise serializers.ValidationError(
                        f'"{res.name}" is not currently available.'
                    )
            self._plan_resource_reservations(
                service=None,
                resource=resource,
                resource_ids=resource_ids,
                start=start,
                end=attrs["end_time"],
                exclude_pk=self.instance.pk if self.instance else None,
            )
        return attrs

    def _plan_resource_reservations(
        self, *, service, resource, resource_ids, start, end, exclude_pk,
    ):
        """The single place that decides which resources a booking
        reserves and checks their capacity - shared by validate()
        (called unlocked, advisory/UX-only) and create()/update()
        (called again inside a transaction.atomic()+select_for_update
        block, where it's the authoritative, race-safe check). Raises
        serializers.ValidationError exactly like the capacity checks
        it replaces if a required resource (or every member of an
        alternative group) has no room; returns the concrete
        (resource, requirement_type, quantity) plan to reserve,
        picking the first available candidate (by id) for each
        alternative group and skipping optional resources with no
        room rather than blocking on them.
        """
        if service:
            requirements = service_resource_requirements(service)
        elif resource_ids:
            requirements = [
                ResourceRequirement(res, "required", "", 1)
                for res in resource_ids
            ]
        elif resource:
            requirements = [ResourceRequirement(resource, "required", "", 1)]
        else:
            requirements = []

        plan = []
        groups = {}
        for req in requirements:
            has_room = resource_has_capacity(
                req.resource, start, end,
                needed_quantity=req.quantity, exclude_booking_id=exclude_pk,
            )
            if req.requirement_type == "alternative" and req.alternative_group:
                groups.setdefault(req.alternative_group, []).append(
                    (req, has_room)
                )
                continue
            if req.requirement_type == "required":
                if not has_room:
                    raise serializers.ValidationError(
                        f'"{req.resource.name}" is fully booked for '
                        "this time."
                    )
                plan.append((req.resource, req.requirement_type, req.quantity))
            elif req.requirement_type == "optional" and has_room:
                plan.append((req.resource, req.requirement_type, req.quantity))

        for group, candidates in groups.items():
            chosen = next(
                (req for req, has_room in candidates if has_room), None
            )
            if chosen is None:
                names = ", ".join(req.resource.name for req, _ in candidates)
                raise serializers.ValidationError(
                    f"No available resource among: {names}."
                )
            plan.append((chosen.resource, chosen.requirement_type, chosen.quantity))

        return plan

    def _locked_resource_ids(self, service, resource, resource_ids):
        """Every Resource row this write could reserve, so they can
        all be select_for_update()'d together in one stable order -
        avoids deadlocking against a concurrent write that locks an
        overlapping resource set in a different order.
        """
        ids = set()
        if service:
            ids.update(
                req.resource.id for req in service_resource_requirements(service)
            )
        if resource:
            ids.add(resource.id)
        if resource_ids:
            ids.update(res.id for res in resource_ids)
        return sorted(ids)

    def _apply_resource_plan(self, booking, plan):
        """Creates the ResourceReservation (and, where priced/rental,
        BookingResourceCharge/ResourceRental) rows for a finalized
        plan from _plan_resource_reservations(), and - for a direct
        (no-service) booking - folds any resource charges into the
        booking's own payment_amount/payment_status so
        BookingCheckoutView/Stripe/webhooks need no changes to
        support resource payments (closes the pre-existing gap where
        a priced resource was silently always free).
        """
        total_amount = Decimal("0")
        has_priced = False
        for res, requirement_type, quantity in plan:
            reservation = ResourceReservation.objects.create(
                workspace_id=booking.workspace_id,
                booking=booking,
                resource=res,
                requirement_type=requirement_type,
                quantity=quantity,
            )
            if res.pricing_mode != Resource.PricingMode.NONE and res.price:
                BookingResourceCharge.objects.create(
                    booking=booking,
                    resource_reservation=reservation,
                    amount=res.price,
                    description=(
                        f"{res.name} ({res.get_pricing_mode_display()})"
                    ),
                )
                total_amount += res.price
                has_priced = True
            if res.reservation_mode == Resource.ReservationMode.RENTAL:
                policy = getattr(res, "rental_policy", None)
                ResourceRental.objects.create(
                    booking=booking,
                    resource_reservation=reservation,
                    deposit_status=(
                        ResourceRental.DepositStatus.PENDING
                        if policy and policy.deposit_required
                        else ResourceRental.DepositStatus.NOT_REQUIRED
                    ),
                    deposit_amount=policy.deposit_amount if policy else None,
                )

        # Only a direct resource booking's price flows into
        # Booking.payment_amount here - a service booking's price
        # already comes from the service itself (see the
        # payment_requirement branch above in validate()); resource
        # charges attached to a service booking are tracked via
        # BookingResourceCharge but don't change what the service
        # itself charges, matching BOOK-92 ("connected to bookings
        # and invoices") without conflating the two prices.
        if not booking.service and has_priced:
            booking.payment_amount = total_amount
            booking.payment_status = Booking.PaymentStatus.PENDING
            booking.save(update_fields=["payment_amount", "payment_status"])

    def create(self, validated_data):
        resource_ids = validated_data.pop("resource_ids", None)
        service = validated_data.get("service")
        resource = validated_data.get("resource")
        start = validated_data["start_time"]
        end = validated_data["end_time"]

        # LIMIT-01/03: a rolling monthly cap, not locked the way
        # resource/service capacity is - an off-by-one here under a
        # true simultaneous race is a low-stakes plan-limit nuance,
        # not a double-booked physical resource, so it doesn't
        # warrant the same select_for_update() treatment.
        workspace = validated_data.get("workspace")
        plan = workspace.plan if workspace else None
        if (
            plan
            and plan.max_bookings_per_month is not None
            and workspace.bookings_this_month_count()
            >= plan.max_bookings_per_month
        ):
            raise serializers.ValidationError(
                f"You've reached the {plan.name} plan's limit of "
                f"{plan.max_bookings_per_month} bookings this month. "
                f"Upgrade your plan to create more."
            )

        with transaction.atomic():
            lock_ids = self._locked_resource_ids(service, resource, resource_ids)
            if lock_ids:
                # Materialize under lock - the queryset itself must be
                # evaluated here, or the SELECT ... FOR UPDATE never
                # actually runs.
                list(
                    Resource.objects.select_for_update()
                    .filter(id__in=lock_ids).order_by("id")
                )
            if service:
                service = Service.objects.select_for_update().get(pk=service.id)
                validated_data["service"] = service

            plan = self._plan_resource_reservations(
                service=service, resource=resource, resource_ids=resource_ids,
                start=start, end=end, exclude_pk=None,
            )
            # A single reserved resource keeps populating the legacy
            # `resource` FK (old exports, __str__, existing frontend);
            # more than one leaves it null and relies entirely on
            # ResourceReservation, same as a service booking already
            # does.
            if not service and len(plan) == 1:
                validated_data["resource"] = plan[0][0]
            elif not service:
                validated_data["resource"] = None

            booking = Booking.objects.create(**validated_data)
            self._apply_resource_plan(booking, plan)

        return booking

    def update(self, instance, validated_data):
        resource_ids = validated_data.pop("resource_ids", None)
        resource_set_changed = (
            resource_ids is not None or "resource" in validated_data
        )
        time_changed = "start_time" in validated_data
        service = validated_data.get("service", instance.service)
        resource = validated_data.get("resource", instance.resource)
        start = validated_data.get("start_time", instance.start_time)
        end = validated_data.get("end_time", instance.end_time)

        with transaction.atomic():
            if time_changed or resource_set_changed:
                lock_ids = self._locked_resource_ids(
                    service, resource, resource_ids
                )
                if lock_ids:
                    list(
                        Resource.objects.select_for_update()
                        .filter(id__in=lock_ids).order_by("id")
                    )
                if service:
                    service = Service.objects.select_for_update().get(
                        pk=service.id
                    )
                plan = self._plan_resource_reservations(
                    service=service, resource=resource,
                    resource_ids=resource_ids if resource_set_changed else None,
                    start=start, end=end, exclude_pk=instance.pk,
                )
                if not service and len(plan) == 1:
                    validated_data["resource"] = plan[0][0]
                elif not service:
                    validated_data["resource"] = None

            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

            if time_changed or resource_set_changed:
                # The old plan's reservations (and anything chained
                # off them - charges, rentals) are superseded by the
                # new one; ResourceReservation.resource is PROTECT,
                # but deleting the reservation row itself is exactly
                # what "release on reschedule" (BOOK-68) means - the
                # Booking row this history hung off keeps existing,
                # so nothing about past reservations is lost, only
                # this booking's current holds.
                # NOTE: this recreates ResourceRental rows too, which
                # would discard check-in/out or deposit state on an
                # already-active rental being rescheduled - the
                # rental lifecycle phase (BOOK-98's reschedule-notice
                # rules) should special-case that rather than this
                # generic reschedule path.
                instance.resource_reservations.all().delete()
                self._apply_resource_plan(instance, plan)

        return instance


class PublicWorkspaceSerializer(serializers.ModelSerializer):
    """The guest-facing view of a workspace (BOOK-21/26) - only the
    handful of fields a booking page actually needs to render, never
    the owner-only fields WorkspaceSerializer exposes (client/team
    counts, Stripe connection status, plan).
    """

    class Meta:
        model = Workspace
        fields = [
            "id", "name", "slug", "logo", "currency", "timezone",
            "brand_color",
        ]


class PublicBookingSerializer(BookingSerializer):
    """A guest books through /public/<slug>/bookings/ (BOOK-21) with
    no account and no request.user to derive a workspace or client
    from: the workspace comes from the URL slug (passed in via
    context by the view) and a Client is found-or-created from the
    name/email the guest types in, instead of an existing login.
    Every other rule (capacity, buffers, notice, blocked time, caps)
    is inherited unchanged from BookingSerializer.
    """

    client_name = serializers.CharField(write_only=True, max_length=255)
    client_email = serializers.EmailField(write_only=True)
    client = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + [
            "client_name", "client_email",
        ]

    def validate_staff(self, value):
        if value is None:
            return value
        workspace = self.context["workspace"]
        if value.staff_workspace_id != workspace.id:
            raise serializers.ValidationError(
                "Can only assign a team member from this workspace."
            )
        return value

    def validate(self, attrs):
        # service/resource are plain PrimaryKeyRelatedFields with an
        # unrestricted queryset (this is pre-existing looseness the
        # authenticated flow gets away with because a logged-in
        # user's own workspace scoping happens elsewhere) - the
        # public endpoint has no such scoping anywhere else, so it's
        # the one place a cross-workspace id must be rejected here.
        workspace = self.context["workspace"]
        service = attrs.get("service")
        resource = attrs.get("resource")
        if service and service.workspace_id != workspace.id:
            raise serializers.ValidationError("Invalid service.")
        if resource and resource.workspace_id != workspace.id:
            raise serializers.ValidationError("Invalid resource.")
        return super().validate(attrs)

    def create(self, validated_data):
        client_name = validated_data.pop("client_name")
        client_email = validated_data.pop("client_email")
        workspace = self.context["workspace"]
        client, _ = Client.objects.get_or_create(
            workspace=workspace,
            contact_email=client_email,
            defaults={"company_name": client_name},
        )
        validated_data["workspace"] = workspace
        validated_data["client"] = client
        return super().create(validated_data)


class RecurringSeriesCreateSerializer(serializers.Serializer):
    """Creates a RecurringSeries plus a Booking for each week,
    validating each occurrence the same way a single booking
    would (past-time, capacity). If any occurrence fails, the
    whole series is rolled back - so the client never ends up
    with a partial series.
    """

    service = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.all()
    )
    client = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(), required=False
    )
    start_time = serializers.DateTimeField()
    occurrences = serializers.IntegerField(min_value=2, max_value=52)

    def create(self, validated_data):
        from datetime import timedelta
        from django.db import transaction

        service = validated_data["service"]
        client = validated_data["client"]
        first_start = validated_data["start_time"]
        occurrences = validated_data["occurrences"]

        with transaction.atomic():
            series = RecurringSeries.objects.create(
                workspace=service.workspace,
                service=service,
                client=client,
            )
            bookings = []
            for week in range(occurrences):
                start = first_start + timedelta(weeks=week)
                booking_serializer = BookingSerializer(
                    data={
                        "service": service.id,
                        "start_time": start,
                    }
                )
                booking_serializer.is_valid(raise_exception=True)
                booking = booking_serializer.save(
                    workspace=service.workspace,
                    client=client,
                    series=series,
                )
                bookings.append(booking)
            return series, bookings


class WaitlistEntrySerializer(serializers.ModelSerializer):
    """Owner creates/manages entries for any client; clients create
    entries for themselves only (client is forced server-side in
    the view, never trusted from the request body). client is
    required=False here for the same reason as BookingSerializer.
    """
    service_name = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    client = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(), required=False
    )

    class Meta:
        model = WaitlistEntry
        fields = [
            "id", "workspace", "service", "service_name", "client",
            "client_name", "start_time", "notified", "created_at",
        ]
        read_only_fields = ["workspace", "notified", "created_at"]

    def get_service_name(self, obj):
        return obj.service.name

    def get_client_name(self, obj):
        return obj.client.company_name


class ReviewSerializer(serializers.ModelSerializer):
    """Client creates a review tied to one of their own completed
    bookings; the booking, service, and client are all forced
    server-side (client never picks the booking arbitrarily - the
    view scopes it to their own completed, not-yet-reviewed
    bookings). Owner responds via a separate action, never by
    editing rating/comment directly.
    """
    service_name = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = [
            "id", "workspace", "service", "service_name", "client",
            "client_name", "booking", "rating", "comment",
            "owner_response", "created_at",
        ]
        read_only_fields = [
            "workspace", "service", "client", "owner_response",
            "created_at",
        ]

    def get_service_name(self, obj):
        return obj.service.name

    def get_client_name(self, obj):
        return obj.client.company_name

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError(
                "Rating must be between 1 and 5."
            )
        return value

    def validate_booking(self, value):
        if value.status != "completed":
            raise serializers.ValidationError(
                "You can only review a completed booking."
            )
        if hasattr(value, "review"):
            raise serializers.ValidationError(
                "This booking has already been reviewed."
            )
        return value


class ReviewResponseSerializer(serializers.Serializer):
    """Owner's public response to a review."""
    owner_response = serializers.CharField(allow_blank=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    """Owner or client requests a reset link by email."""
    email = serializers.EmailField()

    def save(self):
        email = self.validated_data["email"]
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Don't reveal whether the email exists.
            return
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
        send_mail(
            subject="Reset your password",
            message=(
                f"Click the link below to reset your password.\n\n"
                f"{link}\n\nIf you didn't request this, ignore this "
                f"email."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Client/owner submits the token from their email + new
    password.
    """
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        try:
            user_id = urlsafe_base64_decode(attrs["uid"]).decode()
            user = User.objects.get(pk=user_id)
        except (
            User.DoesNotExist, ValueError, TypeError, OverflowError,
        ):
            raise serializers.ValidationError(
                "This reset link is invalid."
            )
        if not default_token_generator.check_token(
            user, attrs["token"]
        ):
            raise serializers.ValidationError(
                "This reset link is invalid or has expired."
            )
        attrs["user"] = user
        return attrs

    def save(self):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["password"])
        user.save(update_fields=["password"])
        return user
