from .models import (
    Client, ClientInvite, Document, Milestone, Project, User,
    Workspace,
)
from rest_framework import serializers
from django.utils import timezone


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
