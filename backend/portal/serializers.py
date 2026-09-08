from .models import (
    Approval, Client, ClientInvite, Document, Invoice, InvoiceItem,
    Message, Milestone, Project, RecurringSeries, Resource, Review,
    Service, SubscriptionPlan, Task, TeamInvite, User, WaitlistEntry,
    WorkingHours, Booking, Workspace,
)
from rest_framework import serializers
from django.utils import timezone
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.conf import settings
from django.core.mail import send_mail


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = [
            "id", "workspace", "company_name",
            "contact_email", "created_at",
        ]
        read_only_fields = ["workspace"]


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

    class Meta:
        model = Workspace
        fields = [
            "id", "name", "slug", "logo", "currency", "timezone",
            "brand_color", "plan", "client_count", "team_member_count",
        ]
        read_only_fields = ["id", "slug"]

    def get_client_count(self, obj):
        return obj.clients.count()

    def get_team_member_count(self, obj):
        return obj.team_members.count()

    def validate_brand_color(self, value):
        import re
        if not re.match(r"^#[0-9A-Fa-f]{6}$", value):
            raise serializers.ValidationError(
                "Must be a hex color like #2563eb."
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
    who uploaded a file.
    """
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id", "project", "file", "original_name",
            "size_bytes", "uploaded_at", "uploaded_by_name",
        ]
        read_only_fields = [
            "original_name", "size_bytes", "uploaded_at",
        ]

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.first_name
        return None


class MessageSerializer(serializers.ModelSerializer):
    """Includes the sender's name and role, derived so the frontend
    can render "you" vs "them" bubbles without a second lookup.
    """
    sender_name = serializers.SerializerMethodField()
    sender_role = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "project", "body", "created_at",
            "sender_name", "sender_role",
        ]
        read_only_fields = ["created_at"]

    def get_sender_name(self, obj):
        if obj.sender:
            return obj.sender.first_name
        return "Deleted user"

    def get_sender_role(self, obj):
        if obj.sender:
            return obj.sender.role
        return None


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
            "resource_names",
        ]
        read_only_fields = ["workspace"]

    def get_resource_names(self, obj):
        return [r.name for r in obj.resources.all()]


class ResourceSerializer(serializers.ModelSerializer):
    """Full CRUD for a bookable resource. `services` is a list of
    service IDs this resource is tied to - a booking for any of
    those services reserves one unit of this resource for its
    time slot.
    """

    class Meta:
        model = Resource
        fields = [
            "id", "workspace", "name", "description", "quantity",
            "services", "created_at",
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
    themselves never send it - the view fills it in. Checks the
    service's capacity AND every associated resource's quantity
    for the same time slot, so a booking can never be confirmed
    if either is exhausted.
    """
    service_name = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    remaining_capacity = serializers.SerializerMethodField()
    client = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(), required=False
    )

    class Meta:
        model = Booking
        fields = [
            "id", "workspace", "service", "service_name", "client",
            "client_name", "series", "start_time", "end_time",
            "status", "notes", "created_at", "remaining_capacity",
        ]
        read_only_fields = ["workspace", "end_time"]

    def get_service_name(self, obj):
        return obj.service.name

    def get_client_name(self, obj):
        return obj.client.company_name

    def get_remaining_capacity(self, obj):
        taken = Booking.objects.filter(
            workspace=obj.workspace,
            service=obj.service,
            status="confirmed",
            start_time=obj.start_time,
        ).count()
        return max(obj.service.capacity - taken, 0)

    def validate(self, attrs):
        service = attrs.get("service") or self.instance.service
        start = attrs.get("start_time") or self.instance.start_time
        from datetime import timedelta

        if not self.instance and start < timezone.now():
            raise serializers.ValidationError(
                "You cannot book a time in the past."
            )

        attrs["end_time"] = start + timedelta(
            minutes=service.duration_minutes
        )
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
        for resource in service.resources.all():
            resource_overlap = Booking.objects.filter(
                workspace=service.workspace,
                service__resources=resource,
                status="confirmed",
                start_time__lt=attrs["end_time"],
                end_time__gt=start,
            )
            if self.instance:
                resource_overlap = resource_overlap.exclude(
                    pk=self.instance.pk
                )
            if resource_overlap.count() >= resource.quantity:
                raise serializers.ValidationError(
                    f'"{resource.name}" is fully booked for this time.'
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
