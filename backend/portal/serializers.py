from .models import (
    Client, ClientInvite, Document, Invoice, InvoiceItem, Message,
    Milestone, Project, Task, User, Workspace,
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


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "name", "slug", "logo"]
        read_only_fields = ["id", "slug"]


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
