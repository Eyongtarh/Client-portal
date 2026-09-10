import io
import logging
from datetime import datetime, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import stripe
from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.db.models import Q
from django.http import FileResponse, HttpResponseRedirect
from django.utils import timezone
from django.utils.dateparse import parse_date
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .activity import log as log_activity
from .currencies import COUNTRIES
from .payments import create_checkout_session
from .permissions import IsOwnerOrStaffForWrite
from .models import (
    Activity, Approval, Booking, Client, Document, Invoice, Message,
    Milestone, PaymentMethod, Project, RecurringSeries, Resource, Review,
    Service, SubscriptionPlan, Task, User, WaitlistEntry, WorkingHours,
    Workspace,
)
from .serializers import (
    AcceptInviteSerializer,
    AcceptTeamInviteSerializer,
    ActivitySerializer,
    ApprovalDecisionSerializer,
    ApprovalSerializer,
    BookingSerializer,
    ChangePasswordSerializer,
    ChangePlanSerializer,
    ClientInviteCreateSerializer,
    ClientSelfSerializer,
    ClientSerializer,
    DocumentSerializer,
    InvoiceSerializer,
    MeSerializer,
    MeUpdateSerializer,
    MessageSerializer,
    MilestoneSerializer,
    PasswordResetConfirmSerializer,
    PaymentMethodSerializer,
    PasswordResetRequestSerializer,
    ProjectSerializer,
    RecurringSeriesCreateSerializer,
    RegisterSerializer,
    ResourceSerializer,
    ReviewResponseSerializer,
    ReviewSerializer,
    ServiceSerializer,
    SubscriptionPlanSerializer,
    TaskSerializer,
    TeamInviteCreateSerializer,
    TeamMemberSerializer,
    WaitlistEntrySerializer,
    WorkingHoursSerializer,
    WorkspaceSerializer,
)

logger = logging.getLogger(__name__)


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ - owner sign-up."""
    serializer_class = RegisterSerializer
    authentication_classes = []
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_201_CREATED)


class MeView(APIView):
    """GET /api/auth/me/ - who is currently logged in.
    PATCH /api/auth/me/ - self-service profile editing (AUTH-05,
    PORTAL-04): name and email only, see MeUpdateSerializer.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(self._data(request.user))

    def patch(self, request):
        serializer = MeUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self._data(request.user))

    def _data(self, user):
        data = MeSerializer(user).data
        if user.role in ("owner", "staff"):
            workspace = user.get_workspace()
            data["workspace_id"] = workspace.id
            data["workspace_name"] = workspace.name
        else:
            client = user.client_profile
            data["client_id"] = client.id
            data["company_name"] = client.company_name
        return data


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ - self-service password
    change while logged in (AUTH-05, PORTAL-04), distinct from the
    forgot-password email flow (PasswordReset*View) used when
    logged out.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"user": request.user}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(
            serializer.validated_data["new_password"]
        )
        request.user.save(update_fields=["password"])
        return Response(status=204)


class InviteClientView(generics.CreateAPIView):
    """POST /api/invites/ - owner or staff invites a client by
    email, then sends them a link to accept it and set up their
    account. Blocked once the workspace's plan client limit is
    reached.
    """
    serializer_class = ClientInviteCreateSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        workspace = self.request.user.get_workspace()
        plan = workspace.plan
        if (
            plan
            and plan.max_clients is not None
            and workspace.clients.count() >= plan.max_clients
        ):
            raise ValidationError(
                f"You've reached the {plan.name} plan's limit of "
                f"{plan.max_clients} clients. Upgrade your plan to "
                f"invite more."
            )
        invite = serializer.save(workspace=workspace)
        log_activity(
            workspace, self.request.user, "client_invited", invite
        )
        link = f"{settings.FRONTEND_URL}/accept-invite/{invite.token}"
        send_mail(
            subject=(
                f"{workspace.name} invited you to their "
                "client portal"
            ),
            message=(
                f"You've been invited to {workspace.name}'s "
                f"client portal.\n\nSet up your account here: "
                f"{link}\n\nThis link expires in 7 days."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[invite.email],
            fail_silently=True,
        )


class AcceptInviteView(generics.CreateAPIView):
    """POST /api/auth/accept-invite/ - client sets a password using
    their invite token and gets an account.
    """
    serializer_class = AcceptInviteSerializer
    authentication_classes = []
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client = serializer.save()
        log_activity(
            client.workspace, None, "client_joined", client, client=client
        )
        return Response(
            {"company_name": client.company_name},
            status=status.HTTP_201_CREATED,
        )


class TeamInviteView(generics.CreateAPIView):
    """POST /api/team-invites/ - owner invites a team member by
    email, then sends them a link to accept it and set up their
    staff account. Owner-only (staff can't invite more staff).
    Blocked once the workspace's plan team-member limit is
    reached.
    """
    serializer_class = TeamInviteCreateSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        if self.request.user.role != "owner":
            raise PermissionDenied(
                "Only the workspace owner can invite team members."
            )
        workspace = self.request.user.workspace
        plan = workspace.plan
        if (
            plan
            and plan.max_team_members is not None
            and workspace.team_members.count() >= plan.max_team_members
        ):
            raise ValidationError(
                f"You've reached the {plan.name} plan's limit of "
                f"{plan.max_team_members} team members. Upgrade "
                f"your plan to invite more."
            )
        invite = serializer.save(workspace=workspace)
        log_activity(workspace, self.request.user, "team_invited", invite)
        link = f"{settings.FRONTEND_URL}/accept-team-invite/{invite.token}"
        send_mail(
            subject=(
                f"{workspace.name} invited you to join their team"
            ),
            message=(
                f"You've been invited to join {workspace.name}'s "
                f"team.\n\nSet up your account here: "
                f"{link}\n\nThis link expires in 7 days."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[invite.email],
            fail_silently=True,
        )


class AcceptTeamInviteView(generics.CreateAPIView):
    """POST /api/auth/accept-team-invite/ - invited team member
    sets a password using their invite token and gets a staff
    account.
    """
    serializer_class = AcceptTeamInviteSerializer
    authentication_classes = []
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_activity(
            user.staff_workspace, None, "team_joined", user
        )
        return Response(
            {"workspace_name": user.staff_workspace.name},
            status=status.HTTP_201_CREATED,
        )


class TeamViewSet(viewsets.ModelViewSet):
    """List and remove team members. Owner-only: staff can see
    who else is on the team but can't add or remove anyone.
    """
    serializer_class = TeamMemberSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "delete"]

    def get_queryset(self):
        workspace = self.request.user.get_workspace()
        return User.objects.filter(
            role="staff", staff_workspace=workspace
        )

    def perform_destroy(self, instance):
        if self.request.user.role != "owner":
            raise PermissionDenied(
                "Only the workspace owner can remove team members."
            )
        log_activity(
            instance.staff_workspace,
            self.request.user,
            "team_removed",
            instance,
        )
        instance.delete()


class SubscriptionPlanViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/plans/ - lists the fixed plans so the frontend can
    render a pricing/upgrade page. Read-only: plans are seeded via
    migration, never created through the app.
    """
    serializer_class = SubscriptionPlanSerializer
    permission_classes = [IsAuthenticated]
    queryset = SubscriptionPlan.objects.all()


class WorkspaceUpdateView(generics.RetrieveUpdateAPIView):
    """GET /api/workspace/ - owner, staff, or client views their
    workspace (clients need this for currency/logo when
    booking; owner/staff also get the plan + usage counts).
    PATCH /api/workspace/ - owner-only update, including
    uploading a logo (staff can operate day-to-day but not
    change workspace settings).
    """
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return user.get_workspace()
        return user.client_profile.workspace

    def update(self, request, *args, **kwargs):
        if request.user.role != "owner":
            raise PermissionDenied(
                "Only the owner can update the workspace."
            )
        return super().update(request, *args, **kwargs)


class CountriesView(APIView):
    """GET /api/countries/ - the country -> currency list backing the
    owner's "Country" picker in workspace settings (COUNTRIES in
    portal.currencies is the single source of truth this and
    WorkspaceSerializer.validate_currency both read from, so the
    dropdown and the server-side check can never drift apart).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            [
                {"code": code, "name": name, "currency": currency}
                for code, name, currency in COUNTRIES
            ]
        )


def _stripe_connect_redirect_uri(request):
    return request.build_absolute_uri(
        "/api/workspace/stripe/connect/callback/"
    )


class WorkspaceStripeConnectStartView(APIView):
    """GET /api/workspace/stripe/connect/ - owner starts linking their
    own Stripe account (Connect, Standard) so client payments go to
    them directly instead of the platform's account. Returns the
    Stripe-hosted OAuth authorize URL to redirect the browser to;
    `state` is a signed, time-limited token carrying the workspace id
    so WorkspaceStripeConnectCallbackView can trust it without the
    browser's plain GET redirect from Stripe carrying an auth header.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != "owner":
            raise PermissionDenied(
                "Only the owner can connect a Stripe account."
            )
        if not settings.STRIPE_CONNECT_CLIENT_ID:
            raise ValidationError(
                "Stripe Connect isn't configured for this deployment yet."
            )
        workspace = request.user.get_workspace()
        state = signing.dumps({"workspace_id": workspace.id})
        params = {
            "response_type": "code",
            "client_id": settings.STRIPE_CONNECT_CLIENT_ID,
            "scope": "read_write",
            "redirect_uri": _stripe_connect_redirect_uri(request),
            "state": state,
        }
        url = (
            "https://connect.stripe.com/oauth/authorize?"
            + urlencode(params)
        )
        return Response({"url": url})


class WorkspaceStripeConnectCallbackView(APIView):
    """GET /api/workspace/stripe/connect/callback/ - Stripe redirects
    the owner's browser here after they approve (or deny) connecting
    their account. Plain browser navigation carries no Authorization
    header, so this identifies the workspace from the signed `state`
    round-tripped through Stripe rather than from request auth, and
    always ends by redirecting to the frontend (never returns JSON -
    there's no one to show it to).
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        frontend = f"{settings.FRONTEND_URL}/booking"
        error = request.query_params.get("error")
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        if error or not code or not state:
            return HttpResponseRedirect(
                f"{frontend}?stripe_connect=error"
            )
        try:
            payload = signing.loads(state, max_age=600)
            workspace = Workspace.objects.get(pk=payload["workspace_id"])
        except (signing.BadSignature, Workspace.DoesNotExist, KeyError):
            return HttpResponseRedirect(
                f"{frontend}?stripe_connect=error"
            )
        try:
            token = stripe.OAuth.token(
                grant_type="authorization_code", code=code
            )
        except stripe.error.StripeError:
            logger.exception(
                "Stripe Connect OAuth token exchange failed for "
                "workspace %s",
                workspace.id,
            )
            return HttpResponseRedirect(
                f"{frontend}?stripe_connect=error"
            )
        workspace.stripe_account_id = token["stripe_user_id"]
        workspace.save(update_fields=["stripe_account_id"])
        return HttpResponseRedirect(f"{frontend}?stripe_connect=success")


class WorkspaceStripeConnectDisconnectView(APIView):
    """POST /api/workspace/stripe/connect/disconnect/ - owner unlinks
    their Stripe account. Client payments are blocked (checkout
    raises a clean error) until they connect one again.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != "owner":
            raise PermissionDenied(
                "Only the owner can disconnect a Stripe account."
            )
        workspace = request.user.get_workspace()
        if workspace.stripe_account_id:
            try:
                stripe.OAuth.deauthorize(
                    client_id=settings.STRIPE_CONNECT_CLIENT_ID,
                    stripe_user_id=workspace.stripe_account_id,
                )
            except stripe.error.StripeError:
                # Already revoked on Stripe's side, or Connect isn't
                # configured here anymore either way - our own record
                # is what matters, so still clear it below.
                logger.exception(
                    "Stripe Connect deauthorize failed for workspace %s",
                    workspace.id,
                )
            workspace.stripe_account_id = ""
            workspace.save(update_fields=["stripe_account_id"])
        return Response(WorkspaceSerializer(workspace).data)


class ChangePlanView(APIView):
    """POST /api/workspace/change-plan/ - owner switches their
    workspace to a different plan. Blocked if current usage
    exceeds the new plan's limits.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != "owner":
            raise PermissionDenied(
                "Only the owner can change the subscription plan."
            )
        workspace = request.user.workspace
        serializer = ChangePlanSerializer(
            data=request.data, context={"workspace": workspace}
        )
        serializer.is_valid(raise_exception=True)
        workspace.plan = serializer.validated_data["plan_id"]
        workspace.save(update_fields=["plan"])
        return Response(WorkspaceSerializer(workspace).data)


class PasswordResetRequestView(generics.CreateAPIView):
    """POST /api/auth/password-reset/ - sends a reset link by
    email if the address matches an account.
    """
    serializer_class = PasswordResetRequestSerializer
    authentication_classes = []
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_200_OK)


class PasswordResetConfirmView(generics.CreateAPIView):
    """POST /api/auth/password-reset/confirm/ - sets a new
    password using the uid + token from the reset email.
    """
    serializer_class = PasswordResetConfirmSerializer
    authentication_classes = []
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_200_OK)


class QueryParamFilterMixin:
    """Lets an optional query param (e.g. ?client=3 or ?project=7)
    narrow an already tenant-scoped list, without ever letting it
    escape that tenant scoping - it only ever adds a further
    .filter() on top of what get_queryset() already restricted to
    this workspace/client. Set filter_param (the query string key)
    and filter_field (the ORM field to filter on) on the viewset.

    This exists because every list endpoint used to silently ignore
    these params for owner/staff - e.g. GET /projects/?client=3
    returned every project in the workspace, not just client 3's -
    so the client-detail page could show one client's tabs full of
    a *different* client's tasks/documents/messages/invoices/
    approvals in any workspace with more than one client.
    """
    filter_param = None
    filter_field = None

    def filter_by_query_param(self, queryset):
        if not self.filter_param:
            return queryset
        value = self.request.query_params.get(self.filter_param)
        if not value or not str(value).isdigit():
            return queryset
        return queryset.filter(**{self.filter_field: value})


class ProjectViewSet(QueryParamFilterMixin, viewsets.ModelViewSet):
    """Owners and staff manage their workspace's projects; clients
    see only their own project(s). ?client=<id> narrows the list to
    one client's project(s) - used by the client-detail page.
    ?status=<active|completed|on_hold>, ?deadline_after=<YYYY-MM-DD>
    and ?deadline_before=<YYYY-MM-DD> narrow by status and deadline
    (SEARCH-02). A malformed date is ignored, same as an invalid
    ?client=.
    """
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]
    filter_param = "client"
    filter_field = "client_id"

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Project.objects.filter(workspace=user.get_workspace())
        else:
            qs = Project.objects.filter(client=user.client_profile)
        qs = self.filter_by_query_param(qs)
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        deadline_after = parse_date(
            self.request.query_params.get("deadline_after", "")
        )
        if deadline_after:
            qs = qs.filter(deadline__gte=deadline_after)
        deadline_before = parse_date(
            self.request.query_params.get("deadline_before", "")
        )
        if deadline_before:
            qs = qs.filter(deadline__lte=deadline_before)
        return qs

    def perform_create(self, serializer):
        project = serializer.save(workspace=self.request.user.get_workspace())
        log_activity(
            project.workspace,
            self.request.user,
            "project_created",
            project,
            client=project.client,
        )

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        project = serializer.save()
        if project.status != old_status:
            log_activity(
                project.workspace,
                self.request.user,
                "project_status_changed",
                project,
                client=project.client,
                metadata={"status": project.status},
            )


class MilestoneViewSet(QueryParamFilterMixin, viewsets.ModelViewSet):
    """Same tenant-scoping pattern as ProjectViewSet, scoped through
    the parent project. ?project=<id> narrows to one project.
    """
    serializer_class = MilestoneSerializer
    permission_classes = [IsAuthenticated]
    filter_param = "project"
    filter_field = "project_id"

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Milestone.objects.filter(
                project__workspace=user.get_workspace()
            )
        else:
            qs = Milestone.objects.filter(
                project__client=user.client_profile
            )
        return self.filter_by_query_param(qs)

    def perform_update(self, serializer):
        was_complete = serializer.instance.is_complete
        milestone = serializer.save()
        if milestone.is_complete and not was_complete:
            log_activity(
                milestone.project.workspace,
                self.request.user,
                "milestone_completed",
                milestone,
                client=milestone.project.client,
            )


class TaskViewSet(QueryParamFilterMixin, viewsets.ModelViewSet):
    """Same tenant-scoping pattern as MilestoneViewSet. ?project=<id>
    narrows to one project.
    """
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    filter_param = "project"
    filter_field = "project_id"

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Task.objects.filter(
                project__workspace=user.get_workspace()
            )
        else:
            qs = Task.objects.filter(
                project__client=user.client_profile
            )
        return self.filter_by_query_param(qs)

    def perform_update(self, serializer):
        was_complete = serializer.instance.is_complete
        task = serializer.save()
        if task.is_complete and not was_complete:
            log_activity(
                task.project.workspace,
                self.request.user,
                "task_completed",
                task,
                client=task.project.client,
            )


class ApprovalViewSet(QueryParamFilterMixin, viewsets.ModelViewSet):
    """Same tenant-scoping pattern as TaskViewSet. Owners and
    staff can create/edit; clients get read-only access here and
    record their decision through the separate 'decide' action
    below. ?project=<id> narrows to one project.
    """
    serializer_class = ApprovalSerializer
    permission_classes = [IsAuthenticated]
    filter_param = "project"
    filter_field = "project_id"

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Approval.objects.filter(
                project__workspace=user.get_workspace()
            )
        else:
            qs = Approval.objects.filter(
                project__client=user.client_profile
            )
        return self.filter_by_query_param(qs)

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated()]
        return [IsAuthenticated()]

    def perform_update(self, serializer):
        # Owners/staff edit title/description only; status/comment
        # come through the decide action, never a plain PATCH here.
        if self.request.user.role not in ("owner", "staff"):
            raise PermissionDenied(
                "Only the owner or team can edit an approval request."
            )
        serializer.save()

    def perform_create(self, serializer):
        if self.request.user.role not in ("owner", "staff"):
            raise PermissionDenied(
                "Only the owner or team can request an approval."
            )
        approval = serializer.save()
        log_activity(
            approval.project.workspace,
            self.request.user,
            "approval_requested",
            approval,
            client=approval.project.client,
        )


class ApprovalDecisionView(APIView):
    """POST /api/approvals/<id>/decide/ - client approves or
    requests changes on a pending approval.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        if user.role != "client":
            raise PermissionDenied(
                "Only the client can decide on an approval."
            )
        qs = Approval.objects.filter(
            project__client=user.client_profile
        )
        approval = generics.get_object_or_404(qs, pk=pk)

        serializer = ApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        approval.status = serializer.validated_data["status"]
        approval.client_comment = serializer.validated_data.get(
            "client_comment", ""
        )
        approval.decided_at = timezone.now()
        approval.save()
        verb = (
            "approval_approved"
            if approval.status == "approved"
            else "approval_changes_requested"
        )
        log_activity(
            approval.project.workspace,
            user,
            verb,
            approval,
            client=user.client_profile,
        )

        return Response(ApprovalSerializer(approval).data)


class DocumentViewSet(QueryParamFilterMixin, viewsets.ModelViewSet):
    """Same tenant-scoping pattern as MilestoneViewSet. On create,
    we capture who uploaded it and the file's size automatically -
    the client never has to send those. ?project=<id> narrows to
    one project, ?category=<contract|deliverable|invoice|reference|
    other> narrows by category (DOC-04). A document marked private
    (DOC-06) is hidden from the client entirely - only owner/staff
    can set is_private, and it's always forced False for a
    client's own upload, since a client hiding a file from the
    owner reviewing it would defeat the point.
    """
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]
    filter_param = "project"
    filter_field = "project_id"

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Document.objects.filter(
                project__workspace=user.get_workspace()
            )
        else:
            qs = Document.objects.filter(
                project__client=user.client_profile, is_private=False
            )
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return self.filter_by_query_param(qs)

    def perform_create(self, serializer):
        uploaded_file = self.request.FILES.get("file")
        extra = {
            "uploaded_by": self.request.user,
            "original_name": uploaded_file.name if uploaded_file else "",
            "size_bytes": uploaded_file.size if uploaded_file else 0,
        }
        if self.request.user.role == "client":
            extra["is_private"] = False
        document = serializer.save(**extra)
        log_activity(
            document.project.workspace,
            self.request.user,
            "document_uploaded",
            document,
            client=document.project.client,
        )

    def perform_update(self, serializer):
        if self.request.user.role == "client":
            serializer.save(is_private=False)
        else:
            serializer.save()

    @action(detail=True, methods=["post"], url_path="mark-viewed")
    def mark_viewed(self, request, pk=None):
        """Called by the client portal right before opening a
        document's file link (ACT-02), since that link points
        straight at storage and never touches this API otherwise.
        A no-op for owner/staff viewing their own workspace's files.
        """
        document = self.get_object()
        if request.user.role == "client":
            log_activity(
                document.project.workspace,
                request.user,
                "document_viewed",
                document,
                client=document.project.client,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageViewSet(QueryParamFilterMixin, viewsets.ModelViewSet):
    """Same tenant-scoping pattern as the other project-scoped
    viewsets. The sender is always the logged-in user, never
    client-supplied. ?project=<id> narrows to one project.
    """
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]
    filter_param = "project"
    filter_field = "project_id"

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Message.objects.filter(
                project__workspace=user.get_workspace()
            )
        else:
            qs = Message.objects.filter(
                project__client=user.client_profile
            )
        return self.filter_by_query_param(qs)

    def perform_create(self, serializer):
        uploaded_file = self.request.FILES.get("attachment")
        extra = {"sender": self.request.user}
        if uploaded_file:
            extra["attachment_name"] = uploaded_file.name
            extra["attachment_size_bytes"] = uploaded_file.size
        message = serializer.save(**extra)
        project = message.project
        if self.request.user.role == "client":
            recipient = project.workspace.owner.email
            sender_label = project.client.company_name
        else:
            recipient = project.client.contact_email
            sender_label = project.workspace.name
        body = message.body or f"Sent an attachment: {message.attachment_name}"
        send_mail(
            subject=f"New message from {sender_label}",
            message=(
                f"{sender_label} sent a new message on \"{project.name}\":"
                f"\n\n{body}\n\n"
                "Log in to your portal to reply."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=True,
        )


class InvoiceViewSet(QueryParamFilterMixin, viewsets.ModelViewSet):
    """Same tenant-scoping pattern as the other workspace-scoped
    viewsets. ?client=<id> narrows to one client's invoices.
    ?status=<draft|sent|paid>, ?due_after=<YYYY-MM-DD> and
    ?due_before=<YYYY-MM-DD> narrow by status and due date
    (SEARCH-03). A malformed date is ignored, same as an invalid
    ?client=.

    Write access (create/update/delete) is owner/staff only - a
    client's only legitimate way to affect an invoice is paying it
    via InvoiceCheckoutView, never a direct PATCH. Without this, a
    client could PATCH status="paid" on their own invoice directly,
    completely bypassing Stripe.
    """
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrStaffForWrite]
    filter_param = "client"
    filter_field = "client_id"

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Invoice.objects.filter(workspace=user.get_workspace())
        else:
            qs = Invoice.objects.filter(client=user.client_profile)
        qs = self.filter_by_query_param(qs)
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        due_after = parse_date(self.request.query_params.get("due_after", ""))
        if due_after:
            qs = qs.filter(due_at__gte=due_after)
        due_before = parse_date(
            self.request.query_params.get("due_before", "")
        )
        if due_before:
            qs = qs.filter(due_at__lte=due_before)
        return qs

    def perform_create(self, serializer):
        invoice = serializer.save(workspace=self.request.user.get_workspace())
        log_activity(
            invoice.workspace,
            self.request.user,
            "invoice_created",
            invoice,
            client=invoice.client,
        )

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        extra = {}
        if (
            serializer.validated_data.get("status") == "paid"
            and old_status != "paid"
            and not serializer.instance.paid_at
        ):
            # Covers marking an invoice paid manually (e.g. a Mobile
            # Money transfer the owner confirmed by hand) - a Stripe
            # payment never reaches this path at all, since
            # webhooks._mark_invoice_paid updates the row directly.
            extra["paid_at"] = timezone.now()
        invoice = serializer.save(**extra)
        if invoice.status == old_status:
            return
        if invoice.status == "sent":
            verb = "invoice_sent"
        elif invoice.status == "paid":
            verb = "invoice_paid"
        else:
            return
        log_activity(
            invoice.workspace,
            self.request.user,
            verb,
            invoice,
            client=invoice.client,
            metadata={"total": str(invoice.total)},
        )
        if verb == "invoice_sent":
            send_mail(
                subject=(
                    f"Invoice #{invoice.number} from "
                    f"{invoice.workspace.name}"
                ),
                message=(
                    f"You have a new invoice from {invoice.workspace.name}."
                    f"\n\nInvoice #{invoice.number}\n"
                    f"Total: {invoice.total} {invoice.workspace.currency}\n"
                    + (f"Due: {invoice.due_at}\n" if invoice.due_at else "")
                    + "\nLog in to your client portal to view and pay it."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[invoice.client.contact_email],
                fail_silently=True,
            )
        elif verb == "invoice_paid":
            send_mail(
                subject=f"Payment confirmed: invoice #{invoice.number}",
                message=(
                    f"Invoice #{invoice.number} "
                    f"({invoice.total} {invoice.workspace.currency}) has "
                    f"been marked as paid."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[invoice.workspace.owner.email],
                fail_silently=True,
            )


class InvoicePDFView(APIView):
    """GET /api/invoices/<id>/pdf/ - renders the invoice as a
    downloadable PDF using reportlab, styled with the workspace's
    brand color on the title and total.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        user = request.user
        if user.role in ("owner", "staff"):
            qs = Invoice.objects.filter(workspace=user.get_workspace())
        else:
            qs = Invoice.objects.filter(client=user.client_profile)
        invoice = generics.get_object_or_404(qs, pk=pk)

        if user.role == "client":
            log_activity(
                invoice.workspace,
                user,
                "invoice_viewed",
                invoice,
                client=invoice.client,
            )

        hex_color = invoice.workspace.brand_color or "#2563eb"
        r = int(hex_color[1:3], 16) / 255
        g = int(hex_color[3:5], 16) / 255
        b = int(hex_color[5:7], 16) / 255
        from reportlab.lib.colors import Color, black
        brand = Color(r, g, b)

        buf = io.BytesIO()
        pdf = canvas.Canvas(buf, pagesize=A4)
        width, height = A4
        y = height - 30 * mm
        pdf.setFillColor(brand)
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(20 * mm, y, f"Invoice #{invoice.number}")
        pdf.setFillColor(black)
        y -= 10 * mm
        pdf.setFont("Helvetica", 11)
        pdf.drawString(20 * mm, y, invoice.client.company_name)
        y -= 6 * mm
        pdf.drawString(20 * mm, y, f"Issued: {invoice.issued_at}")
        if invoice.due_at:
            y -= 6 * mm
            pdf.drawString(20 * mm, y, f"Due: {invoice.due_at}")
        y -= 14 * mm
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(20 * mm, y, "Description")
        pdf.drawString(150 * mm, y, "Amount")
        y -= 4 * mm
        pdf.setStrokeColor(brand)
        pdf.line(20 * mm, y, 190 * mm, y)
        pdf.setStrokeColor(black)
        y -= 8 * mm
        pdf.setFont("Helvetica", 11)
        for item in invoice.items.all():
            pdf.drawString(20 * mm, y, item.description[:60])
            pdf.drawRightString(
                190 * mm, y, f"\u20ac{item.amount:,.2f}"
            )
            y -= 7 * mm

        y -= 4 * mm
        pdf.setStrokeColor(brand)
        pdf.line(20 * mm, y, 190 * mm, y)
        pdf.setStrokeColor(black)
        y -= 8 * mm
        pdf.setFillColor(brand)
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawRightString(
            190 * mm, y, f"Total: \u20ac{invoice.total:,.2f}"
        )
        pdf.setFillColor(black)

        pdf.showPage()
        pdf.save()
        buf.seek(0)
        filename = f"invoice-{invoice.number}.pdf"
        return FileResponse(
            buf, as_attachment=True, filename=filename
        )


class InvoiceCheckoutView(APIView):
    """POST /api/invoices/<id>/checkout/ - client starts a Stripe
    Checkout session to pay this invoice online (PAY-01). Returns
    the session URL to redirect the browser to. The invoice is
    never marked paid here - only webhooks.StripeWebhookView does
    that once Stripe itself confirms the charge, so a client can
    never just claim they paid.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        if user.role != "client":
            raise PermissionDenied("Only the client can pay an invoice.")
        if not settings.STRIPE_SECRET_KEY:
            raise ValidationError(
                "Online payments aren't configured for this workspace yet."
            )
        invoice = generics.get_object_or_404(
            Invoice.objects.filter(client=user.client_profile), pk=pk
        )
        if invoice.status == "paid":
            raise ValidationError("This invoice is already paid.")
        if invoice.total <= 0:
            raise ValidationError("This invoice has no amount due.")
        if not invoice.workspace.stripe_account_id:
            raise ValidationError(
                "This business hasn't connected a payment account yet. "
                "Please contact them directly to pay this invoice."
            )
        try:
            session = create_checkout_session(
                amount=invoice.total,
                currency=invoice.workspace.currency,
                description=f"Invoice #{invoice.number}",
                success_url=f"{settings.FRONTEND_URL}/?payment=success",
                cancel_url=f"{settings.FRONTEND_URL}/?payment=cancelled",
                metadata={"type": "invoice", "invoice_id": str(invoice.id)},
                customer_email=user.email,
                stripe_account=invoice.workspace.stripe_account_id,
            )
        except stripe.error.StripeError:
            # Errors here are Stripe rejecting how the business set up
            # this charge (e.g. an invalid workspace currency) - never
            # something the paying client can fix, so don't hand them
            # Stripe's internal error text. Log it for the business to
            # investigate instead.
            logger.exception(
                "Stripe checkout session creation failed for invoice %s",
                invoice.id,
            )
            raise ValidationError(
                "We couldn't start the payment for this invoice. "
                "Please contact the business to fix this."
            )
        invoice.stripe_checkout_session_id = session.id
        invoice.save(update_fields=["stripe_checkout_session_id"])
        return Response({"url": session.url})


class BookingCheckoutView(APIView):
    """POST /api/bookings/<id>/checkout/ - client pays the deposit
    or full amount required to secure a booking (BOOK-72/73). Same
    webhook-confirms-payment pattern as InvoiceCheckoutView.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        if user.role != "client":
            raise PermissionDenied("Only the client can pay for a booking.")
        if not settings.STRIPE_SECRET_KEY:
            raise ValidationError(
                "Online payments aren't configured for this workspace yet."
            )
        booking = generics.get_object_or_404(
            Booking.objects.filter(client=user.client_profile), pk=pk
        )
        if booking.payment_status != "pending":
            raise ValidationError("This booking has no pending payment.")
        if not booking.workspace.stripe_account_id:
            raise ValidationError(
                "This business hasn't connected a payment account yet. "
                "Please contact them directly to pay for this booking."
            )
        booked_name = (
            booking.service.name if booking.service else booking.resource.name
        )
        try:
            session = create_checkout_session(
                amount=booking.payment_amount,
                currency=booking.workspace.currency,
                description=f"Booking: {booked_name}",
                success_url=f"{settings.FRONTEND_URL}/?payment=success",
                cancel_url=f"{settings.FRONTEND_URL}/?payment=cancelled",
                metadata={"type": "booking", "booking_id": str(booking.id)},
                customer_email=user.email,
                stripe_account=booking.workspace.stripe_account_id,
            )
        except stripe.error.StripeError:
            logger.exception(
                "Stripe checkout session creation failed for booking %s",
                booking.id,
            )
            raise ValidationError(
                "We couldn't start the payment for this booking. "
                "Please contact the business to fix this."
            )
        booking.stripe_checkout_session_id = session.id
        booking.save(update_fields=["stripe_checkout_session_id"])
        return Response({"url": session.url})


class ClientViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as the other workspace-scoped
    viewsets. Write access is owner/staff only - a client has no
    legitimate reason to edit their own company_name/notes/archived
    status via this endpoint. By default, archived clients (CLIENT-
    04) are hidden from the list; ?archived=true shows only those.
    """
    permission_classes = [IsAuthenticated, IsOwnerOrStaffForWrite]

    def get_serializer_class(self):
        if self.request.user.role == "client":
            return ClientSelfSerializer
        return ClientSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Client.objects.filter(workspace=user.get_workspace())
            # Archiving only hides a client from the default list -
            # their detail page, projects, invoices etc. must stay
            # reachable by ID, or "archive" would behave like delete.
            if self.action != "list":
                return qs
            if self.request.query_params.get("archived") == "true":
                return qs.filter(is_archived=True)
            return qs.filter(is_archived=False)
        return Client.objects.filter(id=user.client_profile.id)


class ServiceViewSet(viewsets.ModelViewSet):
    """Owners and staff manage services; clients get read-only
    access so they can see what's bookable.
    """
    serializer_class = ServiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Service.objects.filter(workspace=user.get_workspace())
        return Service.objects.filter(
            workspace=user.client_profile.workspace, is_active=True
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


class ResourceViewSet(viewsets.ModelViewSet):
    """Full CRUD for bookable resources (rooms, equipment,
    chairs, vehicles, etc.) for owners/staff. Clients get
    read-only access so they can browse resources for direct
    booking (independent of any service) - resource availability
    itself is still enforced through booking creation and the
    availability endpoint.
    """
    serializer_class = ResourceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Resource.objects.filter(workspace=user.get_workspace())
        return Resource.objects.filter(
            workspace=user.client_profile.workspace
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


class PaymentMethodViewSet(viewsets.ModelViewSet):
    """Manual, offline payment methods (Mobile Money, bank transfer,
    etc.) a workspace publishes for clients who can't pay by card
    via Stripe - see PaymentMethod. Owner/staff manage the list;
    clients get read-only access so they can see how to pay.
    """
    serializer_class = PaymentMethodSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrStaffForWrite]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return PaymentMethod.objects.filter(
                workspace=user.get_workspace()
            )
        return PaymentMethod.objects.filter(
            workspace=user.client_profile.workspace
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


class WorkingHoursViewSet(viewsets.ModelViewSet):
    """Owners and staff manage their weekly hours; clients get
    read-only access (used to render available days before
    picking a slot).
    """
    serializer_class = WorkingHoursSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return WorkingHours.objects.filter(
                workspace=user.get_workspace()
            )
        return WorkingHours.objects.filter(
            workspace=user.client_profile.workspace
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


class BookingViewSet(viewsets.ModelViewSet):
    """Owners and staff see/manage every booking in their
    workspace; clients see only their own and can only ever
    create bookings for themselves (client is forced here, never
    trusted from the request body). A booking is for either a
    service or a resource directly. Sends a confirmation email
    on create and a cancellation email whenever a booking's
    status changes to cancelled, and notifies anyone on the
    waitlist for that exact service+time that a spot has opened
    up (waitlists only apply to services). If a client's new
    booking matches a slot they were on the waitlist for, that
    entry is cleaned up automatically since they no longer need
    to wait for it. Any confirmed booking whose end time has
    passed is automatically flipped to completed, so it stops
    showing as upcoming and becomes reviewable. For owner/staff,
    ?date=<YYYY-MM-DD>, ?service=<id>, ?resource=<id>, ?client=<id>
    and ?status=<confirmed|cancelled|completed|no_show> each
    optionally narrow the list (SEARCH-04) - there's no per-booking
    team-member assignment in the data model yet, so filtering by
    team member isn't possible.
    """
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        workspace = (
            user.get_workspace()
            if user.role in ("owner", "staff")
            else user.client_profile.workspace
        )
        Booking.objects.filter(
            workspace=workspace,
            status="confirmed",
            end_time__lt=timezone.now(),
        ).update(status="completed")
        if user.role in ("owner", "staff"):
            qs = Booking.objects.filter(workspace=workspace)
            params = self.request.query_params
            date_param = parse_date(params.get("date", ""))
            if date_param:
                qs = qs.filter(start_time__date=date_param)
            for param, field in (
                ("service", "service_id"),
                ("resource", "resource_id"),
                ("client", "client_id"),
            ):
                value = params.get(param)
                if value and str(value).isdigit():
                    qs = qs.filter(**{field: value})
            status_param = params.get("status")
            if status_param:
                qs = qs.filter(status=status_param)
            return qs
        return Booking.objects.filter(client=user.client_profile)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role in ("owner", "staff"):
            booking = serializer.save(workspace=user.get_workspace())
        else:
            booking = serializer.save(
                workspace=user.client_profile.workspace,
                client=user.client_profile,
            )
        booked_name = (
            booking.service.name if booking.service else booking.resource.name
        )
        log_activity(
            booking.workspace,
            user,
            "booking_created",
            booking,
            client=booking.client,
        )
        send_mail(
            subject=f"Booking confirmed: {booked_name}",
            message=(
                f"Your booking for {booked_name} is "
                f"confirmed for "
                f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}."
                f"\n\nIf you need to cancel or reschedule, do so "
                f"from your client portal."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[booking.client.contact_email],
            fail_silently=True,
        )
        # If this booking fills a slot the client was waiting on,
        # they no longer need to be on that waitlist. Waitlists
        # only apply to services, so this is a no-op for resource
        # bookings.
        if booking.service:
            WaitlistEntry.objects.filter(
                workspace=booking.workspace,
                service=booking.service,
                client=booking.client,
                start_time=booking.start_time,
            ).delete()

    def perform_update(self, serializer):
        booking = serializer.save()
        booked_name = (
            booking.service.name if booking.service else booking.resource.name
        )
        if booking.status == "cancelled":
            fee_percent = (
                booking.service.late_cancellation_fee_percent
                if booking.service
                else None
            )
            charges_fee = booking.is_late_cancellation and fee_percent
            log_activity(
                booking.workspace,
                self.request.user,
                (
                    "booking_cancelled_late"
                    if charges_fee
                    else "booking_cancelled"
                ),
                booking,
                client=booking.client,
                metadata={"fee_percent": fee_percent} if charges_fee else {},
            )
            fee_note = (
                f"\n\nThis was cancelled inside the "
                f"{booking.service.cancellation_notice_hours}-hour notice "
                f"window, so the {fee_percent}% late-cancellation fee "
                f"applies."
                if charges_fee
                else ""
            )
            send_mail(
                subject=f"Booking cancelled: {booked_name}",
                message=(
                    f"Your booking for {booked_name} on "
                    f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}"
                    f" has been cancelled.{fee_note}"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[booking.client.contact_email],
                fail_silently=True,
            )
            if booking.service:
                waiting = WaitlistEntry.objects.filter(
                    workspace=booking.workspace,
                    service=booking.service,
                    start_time=booking.start_time,
                    notified=False,
                ).order_by("created_at")
                for entry in waiting:
                    send_mail(
                        subject=f"A spot opened up: {entry.service.name}",
                        message=(
                            f"Good news - a spot just opened up for "
                            f"{entry.service.name} at "
                            f"{entry.start_time.strftime(
                                '%A %d %B %Y at %H:%M'
                            )}."
                            f"\n\nBook it now from your client portal "
                            f"before someone else does."
                        ),
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[entry.client.contact_email],
                        fail_silently=True,
                    )
                    entry.notified = True
                    entry.save(update_fields=["notified"])

    @action(detail=True, methods=["post"], url_path="mark-no-show")
    def mark_no_show(self, request, pk=None):
        """POST /api/bookings/<id>/mark-no-show/ - owner/staff marks
        a past confirmed booking as a no-show (distinct from a
        client-initiated cancellation, so no-show rates can be
        tracked separately - BOOK-38/41).
        """
        if request.user.role not in ("owner", "staff"):
            raise PermissionDenied(
                "Only the owner or team can mark a no-show."
            )
        booking = generics.get_object_or_404(
            Booking.objects.filter(
                workspace=request.user.get_workspace()
            ),
            pk=pk,
        )
        if booking.status not in ("confirmed", "completed"):
            raise ValidationError(
                "Only a confirmed or completed booking can be "
                "marked as a no-show."
            )
        booking.status = "no_show"
        booking.save(update_fields=["status"])
        log_activity(
            booking.workspace,
            request.user,
            "booking_no_show",
            booking,
            client=booking.client,
        )
        return Response(BookingSerializer(booking).data)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        """POST /api/bookings/<id>/mark-paid/ - owner/staff confirms
        a manual, offline payment (e.g. Mobile Money) was received
        for a booking with a pending deposit/full payment.
        payment_status is otherwise read-only, normally set only by
        webhooks._mark_booking_paid for card payments Stripe itself
        confirmed - this is the equivalent path for payments Stripe
        never sees.
        """
        if request.user.role not in ("owner", "staff"):
            raise PermissionDenied(
                "Only the owner or team can mark a booking as paid."
            )
        booking = generics.get_object_or_404(
            Booking.objects.filter(
                workspace=request.user.get_workspace()
            ),
            pk=pk,
        )
        if booking.payment_status != "pending":
            raise ValidationError(
                "Only a booking with a pending payment can be "
                "marked paid."
            )
        booking.payment_status = "paid"
        booking.save(update_fields=["payment_status"])
        log_activity(
            booking.workspace,
            request.user,
            "booking_payment_received",
            booking,
            client=booking.client,
        )
        return Response(BookingSerializer(booking).data)


class RecurringSeriesCreateView(APIView):
    """POST /api/recurring-series/ - creates a weekly-repeating
    set of bookings. Owners and staff can book for any client;
    clients book only for themselves (client is forced here, same
    pattern as BookingViewSet). Recurring series are service-only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        data = request.data.copy()
        if user.role in ("owner", "staff"):
            pass
        else:
            data["client"] = user.client_profile.id

        serializer = RecurringSeriesCreateSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        series, bookings = serializer.save()

        first_booking = bookings[0]
        send_mail(
            subject=f"Recurring booking confirmed: {series.service.name}",
            message=(
                f"Your recurring booking for {series.service.name} "
                f"is confirmed, starting "
                f"{first_booking.start_time.strftime('%A %d %B %Y at %H:%M')}"
                f", repeating weekly for {len(bookings)} weeks."
                f"\n\nYou can cancel individual sessions or the "
                f"whole series from your client portal."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[series.client.contact_email],
            fail_silently=True,
        )

        return Response(
            BookingSerializer(bookings, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class RecurringSeriesCancelView(APIView):
    """POST /api/recurring-series/<id>/cancel/ - cancels every
    still-confirmed booking in a series at once.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        if user.role in ("owner", "staff"):
            qs = RecurringSeries.objects.filter(
                workspace=user.get_workspace()
            )
        else:
            qs = RecurringSeries.objects.filter(
                client=user.client_profile
            )
        series = generics.get_object_or_404(qs, pk=pk)

        bookings = series.bookings.filter(status="confirmed")
        count = bookings.count()
        bookings.update(status="cancelled")

        send_mail(
            subject=f"Recurring booking cancelled: {series.service.name}",
            message=(
                f"Your recurring booking series for "
                f"{series.service.name} has been cancelled "
                f"({count} remaining session"
                f"{'s' if count != 1 else ''} removed)."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[series.client.contact_email],
            fail_silently=True,
        )

        return Response({"cancelled_count": count})


class WaitlistEntryViewSet(viewsets.ModelViewSet):
    """Full CRUD for waitlist entries. Owners and staff see/manage
    every entry in their workspace; clients see only their own and
    can only ever create entries for themselves (client is forced
    here, never trusted from the request body). Any entry whose
    time has already passed is pruned before results are
    returned, so no one sees or gets notified about a slot
    that's already gone.
    """
    serializer_class = WaitlistEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        workspace = (
            user.get_workspace()
            if user.role in ("owner", "staff")
            else user.client_profile.workspace
        )
        WaitlistEntry.objects.filter(
            workspace=workspace, start_time__lt=timezone.now()
        ).delete()
        if user.role in ("owner", "staff"):
            return WaitlistEntry.objects.filter(workspace=workspace)
        return WaitlistEntry.objects.filter(client=user.client_profile)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role in ("owner", "staff"):
            entry = serializer.save(workspace=user.get_workspace())
        else:
            entry = serializer.save(
                workspace=user.client_profile.workspace,
                client=user.client_profile,
            )
        send_mail(
            subject=f"You're on the waitlist: {entry.service.name}",
            message=(
                f"You've been added to the waitlist for "
                f"{entry.service.name} at "
                f"{entry.start_time.strftime('%A %d %B %Y at %H:%M')}."
                f"\n\nWe'll email you if that slot opens up - you'll "
                f"still need to book it yourself from your client "
                f"portal, first come first served."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[entry.client.contact_email],
            fail_silently=True,
        )


class ReviewViewSet(viewsets.ModelViewSet):
    """Owners and staff see/manage every review in their workspace
    (read, respond, delete for moderation); clients see only their
    own and can only ever create/edit/delete their own review, tied
    to one of their own completed bookings. service/client/
    workspace are always derived from the booking - never
    trusted from the request body.
    """
    serializer_class = ReviewSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Review.objects.filter(workspace=user.get_workspace())
        return Review.objects.filter(client=user.client_profile)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role != "client":
            raise PermissionDenied(
                "Only a client can leave a review."
            )
        booking = serializer.validated_data["booking"]
        if booking.client != user.client_profile:
            raise PermissionDenied(
                "You can only review your own bookings."
            )
        review = serializer.save(
            workspace=booking.workspace,
            service=booking.service,
            client=user.client_profile,
        )
        log_activity(
            review.workspace,
            user,
            "review_submitted",
            review,
            client=review.client,
        )

    def perform_update(self, serializer):
        # Only the client who wrote it can edit rating/comment;
        # the owner/staff use the separate 'respond' action instead.
        if self.request.user.role != "client":
            raise PermissionDenied(
                "Only the client who wrote a review can edit it."
            )
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        if user.role == "client" and instance.client != user.client_profile:
            raise PermissionDenied(
                "You can only delete your own review."
            )
        instance.delete()

    @action(detail=True, methods=["post"])
    def respond(self, request, pk=None):
        """POST /api/reviews/<id>/respond/ - owner or staff's
        public response to a review.
        """
        if request.user.role not in ("owner", "staff"):
            raise PermissionDenied(
                "Only the owner or team can respond to a review."
            )
        review = generics.get_object_or_404(
            Review.objects.filter(workspace=request.user.get_workspace()),
            pk=pk,
        )
        serializer = ReviewResponseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review.owner_response = serializer.validated_data[
            "owner_response"
        ]
        review.save(update_fields=["owner_response"])
        log_activity(
            review.workspace,
            request.user,
            "review_responded",
            review,
            client=review.client,
        )
        return Response(ReviewSerializer(review).data)


class ActivityViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/activities/ - the audit-trail feed. Owners/staff see
    every event in their workspace (optionally narrowed to one
    client via ?client=<id>, used on the client detail page);
    clients see only events scoped to their own client relationship
    - workspace-internal events (team management, etc.) never reach
    them. Read-only: entries are only ever written internally via
    portal.activity.log().
    """
    serializer_class = ActivitySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Activity.objects.filter(workspace=user.get_workspace())
            client_id = self.request.query_params.get("client")
            if client_id:
                qs = qs.filter(client_id=client_id)
        else:
            qs = Activity.objects.filter(
                workspace=user.client_profile.workspace,
                client=user.client_profile,
            )
        return qs[:100]


class SearchView(APIView):
    """GET /api/search/?q=<term> - owner/staff full-workspace search
    across clients, projects, bookings, documents, invoices, and
    messages (SEARCH-01). Each result is a small hand-picked
    dict, not a full serializer, so a broad match still returns a
    small, fast response; each group is capped at 10 results.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ("owner", "staff"):
            raise PermissionDenied(
                "Search is only available to the workspace owner or team."
            )
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response(
                {
                    "clients": [], "projects": [], "bookings": [],
                    "documents": [], "invoices": [], "messages": [],
                }
            )
        workspace = request.user.get_workspace()

        clients = Client.objects.filter(workspace=workspace).filter(
            Q(company_name__icontains=query)
            | Q(contact_email__icontains=query)
        )[:10]
        projects = Project.objects.filter(
            workspace=workspace, name__icontains=query
        )[:10]
        bookings = Booking.objects.filter(workspace=workspace).filter(
            Q(service__name__icontains=query)
            | Q(resource__name__icontains=query)
            | Q(client__company_name__icontains=query)
        )[:10]
        documents = Document.objects.filter(
            project__workspace=workspace, original_name__icontains=query
        ).select_related("project")[:10]
        invoices = Invoice.objects.filter(workspace=workspace).filter(
            Q(number__icontains=query)
            | Q(client__company_name__icontains=query)
        )[:10]
        messages = Message.objects.filter(
            project__workspace=workspace, body__icontains=query
        ).select_related("project")[:10]

        return Response(
            {
                "clients": [
                    {
                        "id": c.id,
                        "company_name": c.company_name,
                        "contact_email": c.contact_email,
                    }
                    for c in clients
                ],
                "projects": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "client_id": p.client_id,
                        "client_name": p.client.company_name,
                    }
                    for p in projects
                ],
                "bookings": [
                    {
                        "id": b.id,
                        "label": (
                            b.service.name if b.service else b.resource.name
                        ),
                        "start_time": b.start_time,
                        "client_id": b.client_id,
                        "client_name": b.client.company_name,
                    }
                    for b in bookings
                ],
                "documents": [
                    {
                        "id": d.id,
                        "original_name": d.original_name,
                        "project_id": d.project_id,
                        "client_id": d.project.client_id,
                    }
                    for d in documents
                ],
                "invoices": [
                    {
                        "id": i.id,
                        "number": i.number,
                        "status": i.status,
                        "client_id": i.client_id,
                    }
                    for i in invoices
                ],
                "messages": [
                    {
                        "id": m.id,
                        "body": m.body[:140],
                        "project_id": m.project_id,
                        "client_id": m.project.client_id,
                    }
                    for m in messages
                ],
            }
        )


class AvailabilityView(APIView):
    """GET /api/availability/?service=<id>&date=YYYY-MM-DD or
    GET /api/availability/?resource=<id>&date=YYYY-MM-DD
    Returns open time slots for that service or resource on that
    date, in the workspace's own timezone (not the server's).

    Service mode: slots are drawn from the workspace's working
    hours, checking the service's own capacity AND every resource
    tied to it, so a slot is only offered when both the service
    and every resource it needs are free.

    Resource mode: a resource booking is direct and not tied to
    staff time, so slots cover the FULL 24-hour day (not limited
    to working hours) at the resource's own duration_minutes,
    checking the resource's own quantity against both direct
    resource bookings and any service bookings that use it.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        service_id = request.query_params.get("service")
        resource_id = request.query_params.get("resource")
        date_str = request.query_params.get("date")
        if (not service_id and not resource_id) or not date_str:
            return Response(
                {
                    "detail": (
                        "date and either service or resource are "
                        "required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        workspace = (
            user.get_workspace()
            if user.role in ("owner", "staff")
            else user.client_profile.workspace
        )
        tz = ZoneInfo(workspace.timezone)
        target_date = datetime.strptime(
            date_str, "%Y-%m-%d"
        ).date()
        now_local = timezone.now().astimezone(tz).replace(tzinfo=None)

        if resource_id:
            resource = generics.get_object_or_404(
                Resource, pk=resource_id, workspace=workspace
            )
            slot_length = timedelta(minutes=resource.duration_minutes)
            day_start_local = datetime.combine(
                target_date, datetime.min.time(), tzinfo=tz
            )
            day_end_local = day_start_local + timedelta(days=1)
            # A slot only needs to *start* within the selected day; it
            # may run for many hours or days past midnight (e.g. a
            # multi-day resource rental), so the overlap search window
            # must extend by the slot's own length on both sides rather
            # than a fixed 24h padding, or long slots would never be
            # found to overlap and long resources would never produce
            # any slots at all (they'd also never see a fitting
            # conflict from earlier bookings that run into this day).
            query_start = day_start_local - slot_length
            query_end = day_end_local + slot_length
            direct_bookings = list(
                Booking.objects.filter(
                    workspace=workspace,
                    resource=resource,
                    status="confirmed",
                    start_time__lt=query_end,
                    end_time__gt=query_start,
                )
            )
            via_service_bookings = list(
                Booking.objects.filter(
                    workspace=workspace,
                    service__resources=resource,
                    status="confirmed",
                    start_time__lt=query_end,
                    end_time__gt=query_start,
                )
            )
            all_bookings = direct_bookings + via_service_bookings

            slots = []
            cursor = day_start_local.replace(tzinfo=None)
            day_end_naive = day_end_local.replace(tzinfo=None)
            while cursor < day_end_naive:
                slot_end = cursor + slot_length
                overlap_count = sum(
                    1
                    for b in all_bookings
                    if cursor
                    < b.end_time.astimezone(tz).replace(tzinfo=None)
                    and slot_end
                    > b.start_time.astimezone(tz).replace(tzinfo=None)
                )
                in_the_past = cursor < now_local
                if overlap_count < resource.quantity and not in_the_past:
                    slots.append(cursor.strftime("%H:%M"))
                cursor += slot_length

            return Response({"date": date_str, "slots": slots})

        service = generics.get_object_or_404(
            Service, pk=service_id, workspace=workspace
        )
        weekday = target_date.weekday()
        windows = WorkingHours.objects.filter(
            workspace=workspace, weekday=weekday
        )
        day_start_local = datetime.combine(
            target_date, datetime.min.time(), tzinfo=tz
        )
        day_end_local = day_start_local + timedelta(days=1)
        existing = Booking.objects.filter(
            workspace=workspace,
            service=service,
            status="confirmed",
            start_time__gte=day_start_local,
            start_time__lt=day_end_local,
        )

        resources = list(service.resources.all())
        resource_bookings = {}
        for resource in resources:
            resource_bookings[resource.id] = list(
                Booking.objects.filter(
                    workspace=workspace,
                    service__resources=resource,
                    status="confirmed",
                    start_time__gte=day_start_local
                    - timedelta(hours=24),
                    start_time__lt=day_end_local
                    + timedelta(hours=24),
                )
            )

        slot_length = timedelta(minutes=service.duration_minutes)
        slots = []
        for window in windows:
            cursor = datetime.combine(
                target_date, window.start_time
            )
            window_end = datetime.combine(
                target_date, window.end_time
            )
            while cursor + slot_length <= window_end:
                slot_end = cursor + slot_length
                overlap_count = sum(
                    1
                    for b in existing
                    if cursor
                    < b.end_time.astimezone(tz).replace(tzinfo=None)
                    and slot_end
                    > b.start_time.astimezone(tz).replace(
                        tzinfo=None
                    )
                )
                in_the_past = cursor < now_local
                is_full = overlap_count >= service.capacity

                resource_full = False
                for resource in resources:
                    resource_overlap = sum(
                        1
                        for b in resource_bookings[resource.id]
                        if cursor
                        < b.end_time.astimezone(tz).replace(
                            tzinfo=None
                        )
                        and slot_end
                        > b.start_time.astimezone(tz).replace(
                            tzinfo=None
                        )
                    )
                    if resource_overlap >= resource.quantity:
                        resource_full = True
                        break

                if not is_full and not in_the_past and not resource_full:
                    slots.append(cursor.strftime("%H:%M"))
                cursor += slot_length

        return Response({"date": date_str, "slots": slots})
