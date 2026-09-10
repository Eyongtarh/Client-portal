from decimal import Decimal

from .currencies import VALID_CURRENCIES
from .models import (
    Activity, Approval, Client, ClientInvite, Document, Invoice,
    InvoiceItem, Message, Milestone, PaymentMethod, Project,
    RecurringSeries, Resource, Review, Service, SubscriptionPlan, Task,
    TeamInvite, User, WaitlistEntry, WorkingHours, Booking, Workspace,
)
from rest_framework import serializers
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
    the difference.
    """
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Activity
        fields = [
            "id", "verb", "target_type", "target_id", "target_repr",
            "actor_name", "client", "metadata", "created_at",
        ]

    def get_actor_name(self, obj):
        if not obj.actor:
            return None
        if obj.actor.role == "client":
            client = getattr(obj.actor, "client_profile", None)
            return client.company_name if client else obj.actor.email
        return obj.actor.first_name or obj.actor.email


class ClientSerializer(serializers.ModelSerializer):
    """Owner/staff view - includes `notes` (CLIENT-05) and
    `is_archived` (CLIENT-04). Never used for the client's own view
    of themselves - see ClientSelfSerializer - since notes are
    meant to stay private to the workspace side.
    """
    class Meta:
        model = Client
        fields = [
            "id", "workspace", "company_name", "contact_email",
            "notes", "is_archived", "created_at",
        ]
        read_only_fields = ["workspace"]


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
            "max_team_members",
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
    stripe_connected = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            "id", "name", "slug", "logo", "currency", "country", "timezone",
            "brand_color", "reminder_hours_before", "plan", "client_count",
            "team_member_count", "stripe_connected",
        ]
        read_only_fields = ["id", "slug"]

    def get_client_count(self, obj):
        return obj.clients.count()

    def get_team_member_count(self, obj):
        return obj.team_members.count()

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
    """Read-only view of a team member for the owner's team list."""

    class Meta:
        model = User
        fields = ["id", "email", "first_name"]


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


class ServiceSerializer(serializers.ModelSerializer):
    resource_names = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            "id", "workspace", "name", "description", "photo",
            "duration_minutes", "price", "capacity", "is_active",
            "resource_names", "payment_requirement", "deposit_percent",
            "cancellation_notice_hours", "late_cancellation_fee_percent",
        ]
        read_only_fields = ["workspace"]

    def get_resource_names(self, obj):
        return [r.name for r in obj.resources.all()]

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
    time slot. `duration_minutes` is the slot length used when
    this resource is booked directly, without a service - can
    span multiple days (e.g. booking a room for a week) with no
    upper limit; `price` is optional and only applies to that
    direct booking.
    """

    class Meta:
        model = Resource
        fields = [
            "id", "workspace", "name", "description", "photo",
            "quantity", "price", "duration_minutes", "services",
            "created_at",
        ]
        read_only_fields = ["workspace", "created_at"]

    def validate_duration_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "Duration must be at least 1 minute."
            )
        return value


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = [
            "id", "workspace", "name", "account_details", "created_at",
        ]
        read_only_fields = ["workspace", "created_at"]


class WorkingHoursSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkingHours
        fields = [
            "id", "workspace", "weekday", "start_time", "end_time",
        ]
        read_only_fields = ["workspace"]


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
    resource_name = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
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

    class Meta:
        model = Booking
        fields = [
            "id", "workspace", "service", "service_name", "resource",
            "resource_name", "client", "client_name", "series",
            "start_time", "end_time", "status", "notes", "created_at",
            "remaining_capacity", "payment_status", "payment_amount",
            "is_late_cancellation",
        ]
        read_only_fields = [
            "workspace", "end_time", "payment_status", "payment_amount",
            "is_late_cancellation",
        ]

    def get_service_name(self, obj):
        return obj.service.name if obj.service else None

    def get_resource_name(self, obj):
        return obj.resource.name if obj.resource else None

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
        start = attrs.get("start_time") or self.instance.start_time

        if not service and not resource:
            raise serializers.ValidationError(
                "Either a service or a resource must be selected."
            )
        if service and resource:
            raise serializers.ValidationError(
                "Choose either a service or a resource, not both."
            )

        if not self.instance and start < timezone.now():
            raise serializers.ValidationError(
                "You cannot book a time in the past."
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

        if service:
            attrs["end_time"] = start + timedelta(
                minutes=service.duration_minutes
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
            overlapping = Booking.objects.filter(
                workspace=service.workspace,
                service=service,
                status="confirmed",
                start_time__lt=attrs["end_time"],
                end_time__gt=start,
            )
            if self.instance:
                overlapping = overlapping.exclude(pk=self.instance.pk)
            if overlapping.count() >= service.capacity:
                raise serializers.ValidationError(
                    "This time slot is fully booked."
                )

            # A booking for this service also reserves one unit of
            # every resource tied to it - if any resource is already
            # at capacity for this overlapping window, the booking
            # can't be confirmed either.
            for res in service.resources.all():
                resource_overlap = Booking.objects.filter(
                    workspace=service.workspace,
                    service__resources=res,
                    status="confirmed",
                    start_time__lt=attrs["end_time"],
                    end_time__gt=start,
                )
                if self.instance:
                    resource_overlap = resource_overlap.exclude(
                        pk=self.instance.pk
                    )
                if resource_overlap.count() >= res.quantity:
                    raise serializers.ValidationError(
                        f'"{res.name}" is fully booked for this time.'
                    )
        else:
            attrs["end_time"] = start + timedelta(
                minutes=resource.duration_minutes
            )
            # A direct resource booking competes with both other
            # direct bookings of this resource AND any service
            # booking that uses this resource, for the same window.
            direct_overlap = Booking.objects.filter(
                workspace=resource.workspace,
                resource=resource,
                status="confirmed",
                start_time__lt=attrs["end_time"],
                end_time__gt=start,
            )
            via_service_overlap = Booking.objects.filter(
                workspace=resource.workspace,
                service__resources=resource,
                status="confirmed",
                start_time__lt=attrs["end_time"],
                end_time__gt=start,
            )
            if self.instance:
                direct_overlap = direct_overlap.exclude(pk=self.instance.pk)
                via_service_overlap = via_service_overlap.exclude(
                    pk=self.instance.pk
                )
            total_overlap = (
                direct_overlap.count() + via_service_overlap.count()
            )
            if total_overlap >= resource.quantity:
                raise serializers.ValidationError(
                    "This resource is fully booked for this time."
                )
        return attrs


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
