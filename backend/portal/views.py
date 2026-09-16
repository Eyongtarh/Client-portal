import io
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import stripe
from django.conf import settings
from django.core import signing
from django.core.mail import EmailMessage, send_mail
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.http import (
    FileResponse, Http404, HttpResponse, HttpResponseRedirect,
)
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
from .activity import (
    NOTIFICATION_CATEGORIES, VERB_TO_CATEGORY, log as log_activity,
)
from .calendar_invite import build_ics
from .currencies import COUNTRIES
from .payments import create_checkout_session
from .permissions import IsOwnerOrStaffForWrite, staff_scope
from .resource_availability import (
    FULL_DAY_WINDOWS, resource_availability_windows,
    resource_blocked_windows, resource_has_capacity, resource_is_bookable,
    resource_overlapping_reservations, reservations_overlap_count,
    service_resource_requirements,
)
from .models import (
    Activity, Approval, BlockedTime, Booking, Client, Document, Invoice,
    Location, Message, Milestone, PaymentMethod, Project, RecurringSeries,
    Resource, ResourceAvailability, ResourceRental, ResourceRentalPolicy,
    ResourceReservation, Review, Service, ServiceQuestion,
    ServiceResourceRequirement, SubscriptionPlan, Task, User, WaitlistEntry,
    WorkingHours, Workspace,
)
from .serializers import (
    AcceptInviteSerializer,
    AcceptTeamInviteSerializer,
    ActivitySerializer,
    ApprovalDecisionSerializer,
    ApprovalSerializer,
    BlockedTimeSerializer,
    BookingSerializer,
    ChangePasswordSerializer,
    ChangePlanSerializer,
    ClientInviteCreateSerializer,
    ClientSelfSerializer,
    ClientSerializer,
    DeleteAccountSerializer,
    DocumentSerializer,
    InvoiceSerializer,
    LocationSerializer,
    MeSerializer,
    MeUpdateSerializer,
    MessageSerializer,
    MilestoneSerializer,
    PasswordResetConfirmSerializer,
    PaymentMethodSerializer,
    PasswordResetRequestSerializer,
    ProjectSerializer,
    PublicBookingSerializer,
    PublicWorkspaceSerializer,
    RecurringSeriesCreateSerializer,
    RegisterSerializer,
    ResourceAvailabilitySerializer,
    ResourceRentalPolicySerializer,
    ResourceRentalSerializer,
    ResourceReservationSerializer,
    ResourceSerializer,
    ReviewResponseSerializer,
    ReviewSerializer,
    ServiceQuestionSerializer,
    ServiceResourceRequirementSerializer,
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


def _check_storage_limit(workspace, incoming_bytes):
    """LIMIT-01/03: shared by DocumentViewSet and MessageViewSet -
    the two places that add to Workspace.storage_used_mb(). Checked
    against the size the new upload would add, not just current
    usage, so the workspace can't tip over the limit on the upload
    that crosses it.
    """
    plan = workspace.plan
    if not plan or plan.max_storage_mb is None:
        return
    incoming_mb = incoming_bytes / (1024 * 1024)
    if workspace.storage_used_mb() + incoming_mb > plan.max_storage_mb:
        raise ValidationError(
            f"This upload would put you over the {plan.name} plan's "
            f"{plan.max_storage_mb} MB storage limit. Upgrade your "
            f"plan or remove some files first."
        )


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


class DeleteAccountView(APIView):
    """POST /api/auth/delete-account/ - permanently deletes the
    logged-in user's account and everything that hangs off it
    (SEC-05). Requires the current password, same reasoning as
    ChangePasswordView.

    What "everything" means depends on role, purely from how the
    schema already cascades:
    - owner: Workspace.owner is a CASCADE OneToOne, so deleting the
      owner deletes the whole workspace - every client, project,
      document, invoice, message and booking in it. There's no such
      thing as an owner without a workspace, so nothing is kept back.
    - client: Client.user is a CASCADE OneToOne, so deleting the
      client deletes their Client record, which cascades to their
      own projects/invoices/documents/messages/bookings. Other
      clients in the same workspace are untouched.
    - staff: staff_workspace is a plain FK *from* User, so deleting
      a staff account only removes that one user - the workspace
      and everyone else in it are unaffected.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DeleteAccountSerializer(
            data=request.data, context={"user": request.user}
        )
        serializer.is_valid(raise_exception=True)
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
    """List, restrict (TEAM-02), and remove team members. Owner-
    only for every write: staff can see who else is on the team but
    can't add, restrict, or remove anyone.
    """
    serializer_class = TeamMemberSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "delete"]

    def get_queryset(self):
        workspace = self.request.user.get_workspace()
        return User.objects.filter(
            role="staff", staff_workspace=workspace
        )

    def perform_update(self, serializer):
        if self.request.user.role != "owner":
            raise PermissionDenied(
                "Only the workspace owner can change a team member's "
                "access."
            )
        serializer.save()

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
    ?client=. ?assigned_to_me=true (staff only) narrows to projects
    of clients that staff member is assigned to (TEAM-04) - a
    project has no assignment of its own, it inherits its client's.
    """
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]
    filter_param = "client"
    filter_field = "client_id"

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Project.objects.filter(workspace=user.get_workspace())
            qs = staff_scope(qs, user, path="client")
            if (
                user.role == "staff"
                and self.request.query_params.get("assigned_to_me") == "true"
            ):
                qs = qs.filter(client__assigned_staff=user)
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
        workspace = self.request.user.get_workspace()
        plan = workspace.plan
        if (
            plan
            and plan.max_projects is not None
            and workspace.projects.count() >= plan.max_projects
        ):
            raise ValidationError(
                f"You've reached the {plan.name} plan's limit of "
                f"{plan.max_projects} projects. Upgrade your plan to "
                f"create more."
            )
        project = serializer.save(workspace=workspace)
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
            qs = staff_scope(qs, user, path="project__client")
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
            qs = staff_scope(qs, user, path="project__client")
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
            qs = staff_scope(qs, user, path="project__client")
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
            qs = staff_scope(qs, user, path="project__client")
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
        size_bytes = uploaded_file.size if uploaded_file else 0
        project = serializer.validated_data["project"]
        _check_storage_limit(project.workspace, size_bytes)
        extra = {
            "uploaded_by": self.request.user,
            "original_name": uploaded_file.name if uploaded_file else "",
            "size_bytes": size_bytes,
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

    @action(detail=True, methods=["get"], url_path="file")
    def file_view(self, request, pk=None):
        """GET /api/documents/<id>/file/ - the only way to actually
        fetch a document's bytes (SEC-03). get_object() re-runs the
        same get_queryset() scoping as list/retrieve, so a private
        document or one from another workspace 404s here exactly as
        it would anywhere else in the API - a client can't bypass
        DOC-06 just by holding onto a URL. Streamed through Django
        rather than redirecting to the storage backend's own URL, so
        that URL is never exposed to the frontend at all. Also logs
        the ACT-02 read receipt, since this is the one place a
        client's view of a document actually touches the API.
        """
        document = self.get_object()
        try:
            handle = document.file.open("rb")
        except (OSError, IOError):
            raise Http404
        if request.user.role == "client":
            log_activity(
                document.project.workspace,
                request.user,
                "document_viewed",
                document,
                client=document.project.client,
            )
        return FileResponse(handle, filename=document.original_name)


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
            qs = staff_scope(qs, user, path="project__client")
        else:
            qs = Message.objects.filter(
                project__client=user.client_profile
            )
        return self.filter_by_query_param(qs)

    def perform_create(self, serializer):
        uploaded_file = self.request.FILES.get("attachment")
        extra = {"sender": self.request.user}
        if uploaded_file:
            _check_storage_limit(
                serializer.validated_data["project"].workspace,
                uploaded_file.size,
            )
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
        log_activity(
            project.workspace,
            self.request.user,
            "message_sent",
            message,
            client=project.client,
        )
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

    @action(detail=True, methods=["get"], url_path="attachment")
    def attachment_view(self, request, pk=None):
        """GET /api/messages/<id>/attachment/ - same reasoning as
        DocumentViewSet.file_view (SEC-03): get_object() re-applies
        this viewset's own workspace/client scoping, so the storage
        backend's permanent unauthenticated URL is never handed to
        the frontend for a message attachment either.
        """
        message = self.get_object()
        if not message.attachment:
            raise Http404
        try:
            handle = message.attachment.open("rb")
        except (OSError, IOError):
            raise Http404
        return FileResponse(handle, filename=message.attachment_name)


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
            qs = staff_scope(qs, user, path="client")
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
            qs = staff_scope(qs, user, path="client")
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
                190 * mm, y,
                f"{item.amount:,.2f} {invoice.workspace.currency}",
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
            190 * mm, y,
            f"Total: {invoice.total:,.2f} {invoice.workspace.currency}",
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
        booked_name = booking.display_name
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
    ?assigned_to_me=true (staff only) narrows the list to clients
    that staff member is assigned to (TEAM-04) - an opt-in filter
    any staff member can apply themselves, separate from
    User.restricted (TEAM-02), which enforces the same scoping on
    every request for a staff member the owner has explicitly
    marked restricted, rather than leaving it to their own choice.
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
            qs = staff_scope(qs, user)
            if (
                user.role == "staff"
                and self.request.query_params.get("assigned_to_me") == "true"
            ):
                qs = qs.filter(assigned_staff=user)
            # Archiving only hides a client from the default list -
            # their detail page, projects, invoices etc. must stay
            # reachable by ID, or "archive" would behave like delete.
            if self.action != "list":
                return qs
            if self.request.query_params.get("archived") == "true":
                return qs.filter(is_archived=True)
            return qs.filter(is_archived=False)
        return Client.objects.filter(id=user.client_profile.id)


class LocationViewSet(viewsets.ModelViewSet):
    """Full CRUD for a workspace's physical locations (BOOK-06) for
    owners/staff. Clients get read-only access so a booking flow can
    show which location a service is at.
    """
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Location.objects.filter(workspace=user.get_workspace())
        return Location.objects.filter(
            workspace=user.client_profile.workspace, is_active=True
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


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

    @action(detail=True, methods=["get"])
    def calendar(self, request, pk=None):
        """GET /api/resources/<id>/calendar/?from=&to= - BOOK-82: the
        booked events for this one resource, for a per-resource
        calendar view. `from`/`to` are ISO dates; both optional
        (unbounded when omitted).
        """
        resource = self.get_object()
        qs = ResourceReservation.objects.filter(
            resource=resource
        ).select_related("booking", "booking__client")
        from_str = request.query_params.get("from")
        to_str = request.query_params.get("to")
        if from_str:
            qs = qs.filter(booking__end_time__gte=from_str)
        if to_str:
            qs = qs.filter(booking__start_time__lte=to_str)
        return Response(
            ResourceReservationSerializer(qs, many=True).data
        )


class ResourceAvailabilityViewSet(viewsets.ModelViewSet):
    """Owners and staff manage a resource's weekly hours (BOOK-57/
    58); clients get read-only access, same reasoning as
    WorkingHoursViewSet.
    """
    serializer_class = ResourceAvailabilitySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ResourceAvailability.objects.select_related("resource")
        workspace = (
            user.get_workspace()
            if user.role in ("owner", "staff")
            else user.client_profile.workspace
        )
        qs = qs.filter(workspace=workspace)
        resource_id = self.request.query_params.get("resource")
        if resource_id:
            qs = qs.filter(resource_id=resource_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


class ServiceResourceRequirementViewSet(viewsets.ModelViewSet):
    """Owner/staff-only management of a service's explicit required/
    optional/alternative resource requirements (BOOK-72) - see the
    model's own docstring for the fallback-to-legacy-M2M behavior.
    """
    serializer_class = ServiceResourceRequirementSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrStaffForWrite]

    def get_queryset(self):
        user = self.request.user
        workspace = (
            user.get_workspace()
            if user.role in ("owner", "staff")
            else user.client_profile.workspace
        )
        qs = ServiceResourceRequirement.objects.filter(
            service__workspace=workspace
        ).select_related("resource", "service")
        service_id = self.request.query_params.get("service")
        if service_id:
            qs = qs.filter(service_id=service_id)
        return qs


class ResourceReservationViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only - a ResourceReservation only ever exists as a side
    effect of a confirmed booking (see BookingSerializer.
    _apply_resource_plan); this backs the combined resource calendar
    and filter views (BOOK-83/84/85/86). Owner/staff see every
    reservation in their workspace; clients see only their own.
    """
    serializer_class = ResourceReservationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ResourceReservation.objects.select_related(
            "resource", "booking", "booking__client"
        )
        if user.role in ("owner", "staff"):
            qs = qs.filter(workspace=user.get_workspace())
            qs = staff_scope(qs, user, path="booking__client")
        else:
            qs = qs.filter(booking__client=user.client_profile)

        params = self.request.query_params
        if params.get("resource"):
            qs = qs.filter(resource_id=params["resource"])
        if params.get("booking"):
            qs = qs.filter(booking_id=params["booking"])
        if params.get("client"):
            qs = qs.filter(booking__client_id=params["client"])
        if params.get("status"):
            qs = qs.filter(booking__status=params["status"])
        if params.get("type"):
            qs = qs.filter(resource__type=params["type"])
        if params.get("date_from"):
            qs = qs.filter(booking__end_time__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(booking__start_time__lte=params["date_to"])
        return qs.order_by("-booking__start_time")


class ResourceRentalPolicyViewSet(viewsets.ModelViewSet):
    """Owner/staff-only per-resource rental configuration (BOOK-93..
    98) - deposits, min/max duration, cancellation/reschedule notice.
    """
    serializer_class = ResourceRentalPolicySerializer
    permission_classes = [IsAuthenticated, IsOwnerOrStaffForWrite]

    def get_queryset(self):
        return ResourceRentalPolicy.objects.filter(
            resource__workspace=self.request.user.get_workspace()
        )


class ResourceRentalViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only list/retrieve plus the check-out/check-in/mark-
    overdue actions (BOOK-99..103) - a ResourceRental is created
    implicitly whenever a RENTAL-mode resource is booked, never
    directly through this endpoint. Owner/staff only: check-in/out
    is a staff operation, handing over or receiving back a physical
    resource.
    """
    serializer_class = ResourceRentalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        workspace = (
            user.get_workspace()
            if user.role in ("owner", "staff")
            else user.client_profile.workspace
        )
        qs = ResourceRental.objects.filter(
            booking__workspace=workspace
        ).select_related(
            "resource_reservation__resource", "booking__client"
        )
        if user.role == "client":
            qs = qs.filter(booking__client=user.client_profile)
        else:
            qs = staff_scope(qs, user, path="booking__client")
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(rental_status=status_param)
        return qs.order_by("-created_at")

    def _require_staff(self, request):
        if request.user.role not in ("owner", "staff"):
            raise PermissionDenied(
                "Only the business can check a rental in or out."
            )

    @action(detail=True, methods=["post"], url_path="check-out")
    def check_out(self, request, pk=None):
        self._require_staff(request)
        rental = self.get_object()
        rental.checked_out_at = timezone.now()
        rental.checked_out_by = request.user
        rental.condition_notes_out = request.data.get(
            "condition_notes_out", rental.condition_notes_out
        )
        rental.rental_status = ResourceRental.RentalStatus.ACTIVE
        rental.save(update_fields=[
            "checked_out_at", "checked_out_by", "condition_notes_out",
            "rental_status",
        ])
        log_activity(
            rental.booking.workspace, request.user, "resource_checked_out",
            rental, client=rental.booking.client,
        )
        return Response(ResourceRentalSerializer(rental).data)

    @action(detail=True, methods=["post"], url_path="check-in")
    def check_in(self, request, pk=None):
        self._require_staff(request)
        rental = self.get_object()
        rental.checked_in_at = timezone.now()
        rental.checked_in_by = request.user
        rental.condition_notes_in = request.data.get(
            "condition_notes_in", rental.condition_notes_in
        )
        rental.rental_status = ResourceRental.RentalStatus.RETURNED
        rental.save(update_fields=[
            "checked_in_at", "checked_in_by", "condition_notes_in",
            "rental_status",
        ])
        log_activity(
            rental.booking.workspace, request.user, "resource_checked_in",
            rental, client=rental.booking.client,
        )
        return Response(ResourceRentalSerializer(rental).data)

    @action(detail=True, methods=["post"], url_path="mark-overdue")
    def mark_overdue(self, request, pk=None):
        """Manual override mirroring BookingViewSet.mark_no_show -
        the mark_overdue_rentals management command does this
        automatically on a schedule; this lets staff flag one by
        hand too.
        """
        self._require_staff(request)
        rental = self.get_object()
        rental.rental_status = ResourceRental.RentalStatus.OVERDUE
        rental.save(update_fields=["rental_status"])
        return Response(ResourceRentalSerializer(rental).data)


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


class ServiceQuestionViewSet(viewsets.ModelViewSet):
    """Owners and staff manage a service's custom intake questions
    (BOOK-69); clients get read-only access, though in practice they
    see these through ServiceSerializer's nested `questions` field
    while booking rather than calling this endpoint directly.
    """
    serializer_class = ServiceQuestionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return ServiceQuestion.objects.filter(
                workspace=user.get_workspace()
            )
        return ServiceQuestion.objects.filter(
            workspace=user.client_profile.workspace
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


class BlockedTimeViewSet(viewsets.ModelViewSet):
    """Owners and staff manage holidays (BOOK-11, staff left blank)
    and specific blocks (BOOK-12, usually staff set); clients get
    read-only access, same reasoning as WorkingHoursViewSet.
    """
    serializer_class = BlockedTimeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return BlockedTime.objects.filter(
                workspace=user.get_workspace()
            )
        return BlockedTime.objects.filter(
            workspace=user.client_profile.workspace
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


def _send_booking_email(subject, message, booking, cancelled=False):
    """Every booking confirmation/cancellation email carries the
    matching .ics invite as an attachment (BOOK-61) so the client's
    mail app offers to add (or remove) it in their own calendar
    without them needing to visit the portal at all.
    """
    email = EmailMessage(
        subject=subject,
        body=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[booking.client.contact_email],
    )
    email.attach(
        "booking.ics", build_ics(booking, cancelled=cancelled), "text/calendar"
    )
    email.send(fail_silently=True)


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
    ?date=<YYYY-MM-DD>, ?service=<id>, ?resource=<id>, ?client=<id>,
    ?staff=<id> and ?status=<confirmed|cancelled|completed|no_show>
    each optionally narrow the list (SEARCH-04). ?assigned_to_me=true
    (staff only) narrows to bookings assigned to that staff member
    (TEAM-04), same opt-in-filter reasoning as ClientViewSet's.
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
            if user.role == "staff" and user.restricted:
                # A restricted staff member sees bookings for their
                # own assigned clients AND anything they're directly
                # handling (staff=user) even for a client someone
                # else manages - matches this app's existing "a
                # booking's staff field is its own assignment,
                # separate from Client.assigned_staff" reasoning
                # (see TeamAssignmentTestCase's docstring).
                qs = qs.filter(
                    Q(client__assigned_staff=user) | Q(staff=user)
                )
            params = self.request.query_params
            date_param = parse_date(params.get("date", ""))
            if date_param:
                qs = qs.filter(start_time__date=date_param)
            for param, field in (
                ("service", "service_id"),
                ("resource", "resource_id"),
                ("client", "client_id"),
                ("staff", "staff_id"),
            ):
                value = params.get(param)
                if value and str(value).isdigit():
                    qs = qs.filter(**{field: value})
            status_param = params.get("status")
            if status_param:
                qs = qs.filter(status=status_param)
            if user.role == "staff" and params.get("assigned_to_me") == "true":
                qs = qs.filter(staff=user)
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
        booked_name = booking.display_name
        log_activity(
            booking.workspace,
            user,
            "booking_created",
            booking,
            client=booking.client,
        )
        _send_booking_email(
            subject=f"Booking confirmed: {booked_name}",
            message=(
                f"Your booking for {booked_name} is "
                f"confirmed for "
                f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}."
                f"\n\nIf you need to cancel or reschedule, do so "
                f"from your client portal."
            ),
            booking=booking,
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
        booked_name = booking.display_name
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
            _send_booking_email(
                subject=f"Booking cancelled: {booked_name}",
                message=(
                    f"Your booking for {booked_name} on "
                    f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}"
                    f" has been cancelled.{fee_note}"
                ),
                booking=booking,
                cancelled=True,
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


class BookingICSView(APIView):
    """GET /api/bookings/<id>/ics/ - lets whoever can already see
    this booking (BOOK-65) re-download its calendar invite on
    demand, for whenever the original confirmation email attachment
    (BOOK-61) has been lost, deleted, or never arrived.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        user = request.user
        if user.role in ("owner", "staff"):
            qs = Booking.objects.filter(workspace=user.get_workspace())
            if user.role == "staff" and user.restricted:
                qs = qs.filter(
                    Q(client__assigned_staff=user) | Q(staff=user)
                )
        else:
            qs = Booking.objects.filter(client=user.client_profile)
        booking = generics.get_object_or_404(qs, pk=pk)
        ics = build_ics(booking, cancelled=booking.status == "cancelled")
        response = HttpResponse(ics, content_type="text/calendar")
        response["Content-Disposition"] = 'attachment; filename="booking.ics"'
        return response


class BookingAnalyticsView(APIView):
    """GET /api/booking-analytics/ - aggregate booking demand,
    cancellation/no-show rates, and revenue for the workspace
    (BOOK-76..79). Owner and staff both get the same workspace-wide
    read; there's nothing here a team member shouldn't see. Resource
    -only bookings (no service) are counted in totals and revenue
    but excluded from the by-service/staff/location breakdowns,
    which describe a service booking specifically.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role not in ("owner", "staff"):
            raise PermissionDenied(
                "Only the business can view booking analytics."
            )
        workspace = user.get_workspace()
        bookings = Booking.objects.filter(workspace=workspace)

        total = bookings.count()
        status_breakdown = {
            row["status"]: row["count"]
            for row in bookings.values("status").annotate(count=Count("id"))
        }
        for key in ("confirmed", "cancelled", "completed", "no_show"):
            status_breakdown.setdefault(key, 0)

        def rate(count):
            return round(count / total * 100, 1) if total else 0.0

        by_service = [
            {
                "service_id": row["service_id"],
                "name": row["service__name"],
                "count": row["count"],
            }
            for row in bookings.filter(service__isnull=False)
            .values("service_id", "service__name")
            .annotate(count=Count("id"))
            .order_by("-count")
        ]

        by_staff = [
            {
                "staff_id": row["staff_id"],
                "name": row["staff__first_name"] or "Unassigned",
                "count": row["count"],
            }
            for row in bookings.values("staff_id", "staff__first_name")
            .annotate(count=Count("id"))
            .order_by("-count")
        ]

        location_counts = {}
        for service in Service.objects.filter(workspace=workspace):
            count = bookings.filter(service=service).count()
            if not count:
                continue
            label = (
                "Online"
                if service.is_online
                else service.location or "Not specified"
            )
            location_counts[label] = location_counts.get(label, 0) + count
        by_location = [
            {"location": label, "count": count}
            for label, count in sorted(
                location_counts.items(), key=lambda item: -item[1]
            )
        ]

        window_start = timezone.now().date() - timedelta(days=29)
        daily_counts = [
            {"date": row["day"].isoformat(), "count": row["count"]}
            for row in bookings.filter(start_time__date__gte=window_start)
            .annotate(day=TruncDate("start_time"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        ]

        revenue = {
            "paid": bookings.filter(payment_status="paid").aggregate(
                total=Sum("payment_amount")
            )["total"] or Decimal("0"),
            "pending": bookings.filter(payment_status="pending").aggregate(
                total=Sum("payment_amount")
            )["total"] or Decimal("0"),
        }

        return Response({
            "total_bookings": total,
            "status_breakdown": status_breakdown,
            "cancellation_rate": rate(status_breakdown["cancelled"]),
            "no_show_rate": rate(status_breakdown["no_show"]),
            "by_service": by_service,
            "by_staff": by_staff,
            "by_location": by_location,
            "daily_counts": daily_counts,
            "revenue": revenue,
        })


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
            qs = WaitlistEntry.objects.filter(workspace=workspace)
            return staff_scope(qs, user, path="client")
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
            qs = Review.objects.filter(workspace=user.get_workspace())
            return staff_scope(qs, user, path="client")
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
    them. Read-only via the base list/retrieve: entries are only
    ever written internally via portal.activity.log().

    The notification bell (NOTIF-01/02) reuses this same feed and
    scoping rather than a separate endpoint: ?for_notifications=true
    additionally drops any category the user has muted (see
    portal.activity.VERB_TO_CATEGORY), and ?unread_only=true drops
    anything already in that user's own read_by. Three actions back
    the bell's interactions: unread-count, mark-read (one entry),
    and mark-all-read (every entry currently visible to it).
    """
    serializer_class = ActivitySerializer
    permission_classes = [IsAuthenticated]

    def _muted_verbs(self, user):
        muted = user.muted_notification_categories
        if not muted:
            return []
        return [
            verb
            for verb, category in VERB_TO_CATEGORY.items()
            if category in muted
        ]

    def _scoped_queryset(self):
        """Role/client-tenant scoping only, unsliced - the shared
        foundation every action below filters further before
        deciding for itself whether (and how) to slice or count it.
        """
        user = self.request.user
        if user.role in ("owner", "staff"):
            qs = Activity.objects.filter(workspace=user.get_workspace())
            if user.role == "staff" and user.restricted:
                # client is nullable (a workspace-internal event, e.g.
                # a team member joining, has none) - those still
                # reach a restricted staff member; only events tied
                # to a client they're not assigned to are hidden.
                qs = qs.filter(
                    Q(client__isnull=True) | Q(client__assigned_staff=user)
                )
            client_id = self.request.query_params.get("client")
            if client_id:
                qs = qs.filter(client_id=client_id)
        else:
            qs = Activity.objects.filter(
                workspace=user.client_profile.workspace,
                client=user.client_profile,
            )
        return qs

    def get_queryset(self):
        # Deliberately unsliced: get_object() (mark-read, retrieve)
        # calls .get() on this, and Django can't filter/get a query
        # once a slice has been taken - the [:100] cap on the list
        # response happens in list() instead, after get_object()'s
        # concerns no longer apply.
        qs = self._scoped_queryset()
        params = self.request.query_params
        if params.get("for_notifications") == "true":
            qs = qs.exclude(verb__in=self._muted_verbs(self.request.user))
        if params.get("unread_only") == "true":
            qs = qs.exclude(read_by=self.request.user)
        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())[:100]
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        qs = self._scoped_queryset().exclude(
            verb__in=self._muted_verbs(request.user)
        )
        count = qs.exclude(read_by=request.user).count()
        return Response({"count": count})

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        activity = self.get_object()
        activity.read_by.add(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        qs = self._scoped_queryset().exclude(
            verb__in=self._muted_verbs(request.user)
        )
        for activity in qs:
            activity.read_by.add(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationPreferencesView(APIView):
    """GET/PATCH /api/notification-preferences/ - which notification
    categories (NOTIF-02) the current user has muted in their own
    notification bell. available_categories always lists every
    known category so the frontend never has to hardcode that list.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "available_categories": sorted(NOTIFICATION_CATEGORIES.keys()),
            "muted_categories": request.user.muted_notification_categories,
        })

    def patch(self, request):
        muted = request.data.get("muted_categories")
        if not isinstance(muted, list) or not all(
            c in NOTIFICATION_CATEGORIES for c in muted
        ):
            raise ValidationError(
                "muted_categories must be a list drawn from "
                f"{sorted(NOTIFICATION_CATEGORIES.keys())}."
            )
        request.user.muted_notification_categories = muted
        request.user.save(update_fields=["muted_notification_categories"])
        return Response({
            "available_categories": sorted(NOTIFICATION_CATEGORIES.keys()),
            "muted_categories": muted,
        })


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
        user = request.user

        clients = staff_scope(Client.objects.filter(workspace=workspace).filter(
            Q(company_name__icontains=query)
            | Q(contact_email__icontains=query)
        ), user)[:10]
        projects = staff_scope(Project.objects.filter(
            workspace=workspace, name__icontains=query
        ), user, path="client")[:10]
        bookings = staff_scope(Booking.objects.filter(workspace=workspace).filter(
            Q(service__name__icontains=query)
            | Q(resource__name__icontains=query)
            | Q(client__company_name__icontains=query)
        ), user, path="client")[:10]
        documents = staff_scope(Document.objects.filter(
            project__workspace=workspace, original_name__icontains=query
        ), user, path="project__client").select_related("project")[:10]
        invoices = staff_scope(Invoice.objects.filter(workspace=workspace).filter(
            Q(number__icontains=query)
            | Q(client__company_name__icontains=query)
        ), user, path="client")[:10]
        messages = staff_scope(Message.objects.filter(
            project__workspace=workspace, body__icontains=query
        ), user, path="project__client").select_related("project")[:10]

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
                        "label": b.display_name,
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


def compute_service_availability(workspace, service_id, date_str, staff_id):
    """The service-mode half of AvailabilityView, pulled out to a
    plain function so PublicAvailabilityView (BOOK-26, no
    authenticated user to derive a workspace from) can offer a
    guest the exact same slots - and be bound by the exact same
    rules - as the authenticated booking flow, instead of a second,
    driftable copy of ~100 lines of slot math.
    """
    tz = ZoneInfo(workspace.timezone)
    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    now_local = timezone.now().astimezone(tz).replace(tzinfo=None)

    service = generics.get_object_or_404(
        Service, pk=service_id, workspace=workspace
    )

    if service.max_advance_days is not None:
        latest = now_local.date() + timedelta(days=service.max_advance_days)
        if target_date > latest:
            return Response({"date": date_str, "slots": []})

    if service.max_bookings_per_day is not None:
        day_count = Booking.objects.filter(
            workspace=workspace,
            service=service,
            status="confirmed",
            start_time__date=target_date,
        ).count()
        if day_count >= service.max_bookings_per_day:
            return Response({"date": date_str, "slots": []})
    if service.max_bookings_per_week is not None:
        week_start = target_date - timedelta(days=target_date.weekday())
        week_end = week_start + timedelta(days=7)
        week_count = Booking.objects.filter(
            workspace=workspace,
            service=service,
            status="confirmed",
            start_time__date__gte=week_start,
            start_time__date__lt=week_end,
        ).count()
        if week_count >= service.max_bookings_per_week:
            return Response({"date": date_str, "slots": []})

    staff_member = None
    if staff_id:
        staff_member = generics.get_object_or_404(
            User, pk=staff_id, role="staff", staff_workspace=workspace
        )
        if (
            service.staff.exists()
            and staff_member not in service.staff.all()
        ):
            return Response(
                {"detail": "This team member does not perform this service."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    weekday = target_date.weekday()
    # A staff member's own hours (BOOK-10/TEAM-05) replace the
    # workspace default entirely once they have any of their
    # own, rather than filling gaps day-by-day - a staff member
    # who only ever set Monday hours is not implicitly available
    # on the workspace's Tuesday hours too. A service tied to a
    # Location (BOOK-06) falls back one step further before the
    # bare workspace default: that location's own hours (staff
    # blank, location set), same "any of their own" rule.
    has_custom_hours = staff_member and WorkingHours.objects.filter(
        workspace=workspace, staff=staff_member
    ).exists()
    has_location_hours = (
        not has_custom_hours
        and service.location_ref_id
        and WorkingHours.objects.filter(
            workspace=workspace, staff__isnull=True,
            location=service.location_ref,
        ).exists()
    )
    if has_custom_hours:
        windows = WorkingHours.objects.filter(
            workspace=workspace, weekday=weekday, staff=staff_member,
        )
    elif has_location_hours:
        windows = WorkingHours.objects.filter(
            workspace=workspace, weekday=weekday, staff__isnull=True,
            location=service.location_ref,
        )
    else:
        windows = WorkingHours.objects.filter(
            workspace=workspace, weekday=weekday, staff__isnull=True,
            location__isnull=True,
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
    if staff_member:
        existing = existing.filter(staff=staff_member)

    # A holiday (staff blank) always applies; a specific block
    # (staff set) only applies when browsing that staff member's
    # own availability - it never affects anyone else's calendar.
    blocked_qs = BlockedTime.objects.filter(
        workspace=workspace,
        start_time__lt=day_end_local,
        end_time__gt=day_start_local,
    )
    # A true holiday (staff/resource/location all blank) always
    # applies; a staff-specific block only applies when browsing
    # that staff member's own calendar; a location-specific block
    # only applies when this service is tied to that location; a
    # resource-specific block is never relevant to service/staff
    # availability at all (see resource_availability.py for where
    # that's checked instead).
    scope = Q(staff__isnull=True, resource__isnull=True, location__isnull=True)
    if staff_member:
        scope |= Q(staff=staff_member)
    if service.location_ref_id:
        scope |= Q(location=service.location_ref)
    blocked_qs = blocked_qs.filter(scope)
    blocked_windows = [
        (
            b.start_time.astimezone(tz).replace(tzinfo=None),
            b.end_time.astimezone(tz).replace(tzinfo=None),
        )
        for b in blocked_qs
    ]

    # BOOK-72/73: required resources must ALL have room; an
    # alternative group (requirement_type=alternative, a shared
    # non-blank alternative_group) is satisfied by any ONE member
    # having room; optional requirements never block a slot. A
    # service with no ServiceResourceRequirement rows falls back to
    # its legacy `resources` M2M as implicit required/qty-1 rows,
    # so behavior here is unchanged for every service that predates
    # that model.
    requirements = service_resource_requirements(service)
    resource_reservations_map = {
        req.resource.id: resource_overlapping_reservations(
            req.resource,
            day_start_local - timedelta(hours=24),
            day_end_local + timedelta(hours=24),
        )
        for req in {req.resource.id: req for req in requirements}.values()
    }

    def _resources_have_room(window_start, window_end):
        group_results = {}
        for req in requirements:
            reservations = resource_reservations_map[req.resource.id]
            overlap = reservations_overlap_count(
                reservations, window_start, window_end, tz,
                req.resource.capacity_mode,
            )
            limit = (
                req.resource.capacity
                if (
                    req.resource.capacity_mode == Resource.CapacityMode.SHARED
                    and req.resource.capacity
                )
                else req.resource.quantity
            )
            has_room = overlap + req.quantity <= limit
            if req.requirement_type == "alternative" and req.alternative_group:
                group_results.setdefault(req.alternative_group, []).append(
                    has_room
                )
            elif req.requirement_type == "required" and not has_room:
                return False
        return all(any(results) for results in group_results.values())

    slot_length = timedelta(minutes=service.duration_minutes)
    slots = []
    for window in windows:
        cursor = datetime.combine(target_date, window.start_time)
        window_end = datetime.combine(target_date, window.end_time)
        # An existing booking's own buffer_before/buffer_after
        # (BOOK-13) widens ITS window - nothing may start in the
        # buffer_before zone right before it or end in the
        # buffer_after zone right after it (see the identical
        # reasoning in BookingSerializer.validate()).
        buffer_before = timedelta(minutes=service.buffer_before_minutes)
        buffer_after = timedelta(minutes=service.buffer_after_minutes)
        while cursor + slot_length <= window_end:
            slot_end = cursor + slot_length
            overlap_count = sum(
                1
                for b in existing
                if b.start_time.astimezone(tz).replace(tzinfo=None)
                < slot_end + buffer_before
                and b.end_time.astimezone(tz).replace(tzinfo=None)
                > cursor - buffer_after
            )
            too_soon = cursor < now_local + timedelta(
                hours=service.min_notice_hours
            )
            is_blocked = any(
                cursor < b_end and slot_end > b_start
                for b_start, b_end in blocked_windows
            )
            is_full = overlap_count >= service.capacity
            resource_full = not _resources_have_room(cursor, slot_end)

            if (
                not is_full
                and not too_soon
                and not resource_full
                and not is_blocked
            ):
                slots.append(cursor.strftime("%H:%M"))
            cursor += slot_length

    return Response({"date": date_str, "slots": slots})


class AvailabilityView(APIView):
    """GET /api/availability/?service=<id>&date=YYYY-MM-DD or
    GET /api/availability/?resource=<id>&date=YYYY-MM-DD
    Returns open time slots for that service or resource on that
    date, in the workspace's own timezone (not the server's).

    Service mode: slots are drawn from the workspace's working
    hours, checking the service's own capacity AND every resource
    tied to it, so a slot is only offered when both the service
    and every resource it needs are free. An optional &staff=<id>
    (BOOK-04/10/19) narrows this to one team member: their own
    working hours (if they've set any) replace the workspace
    default entirely, and the capacity/conflict check only counts
    that team member's own bookings for this service, not everyone
    else's. 400s if that team member doesn't perform this service.
    Also applies the service's own booking rules (BOOK-11..16): a
    date beyond max_advance_days, or whose daily/weekly booking cap
    is already reached, returns no slots at all; buffer_before/
    buffer_after_minutes pad every existing booking's occupied
    window so a new one can't land in another's prep/recovery time;
    min_notice_hours excludes slots too soon from now; and any
    overlapping BlockedTime (a holiday, staff blank, or a specific
    block, staff set) removes that slot regardless of working hours.

    Resource mode: a resource booking is direct and not tied to
    staff time. A resource with no ResourceAvailability rows of its
    own is bookable across the FULL 24-hour day (unchanged from
    this system's original behavior); one with configured windows
    is restricted to them, each slot required to fit entirely
    inside a window. Either way, slots are at the resource's own
    duration_minutes, apply its booking buffers/min-notice/max-
    advance rules, exclude any resource-specific or workspace-wide
    BlockedTime, and check capacity (EXCLUSIVE: resource.quantity,
    SHARED: resource.capacity) against every ResourceReservation -
    both a direct reservation of this resource and one made because
    a service that requires it was booked. A resource that's
    unbookable (BOOK-80: blocked/maintenance/cleaning/inactive/
    retired) or reservable only via a service
    (reservation_mode=BOOKING) returns no slots here.
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
            if (
                not resource_is_bookable(resource)
                or resource.reservation_mode == Resource.ReservationMode.BOOKING
            ):
                return Response({"date": date_str, "slots": []})
            if resource.max_advance_days is not None:
                latest = now_local.date() + timedelta(
                    days=resource.max_advance_days
                )
                if target_date > latest:
                    return Response({"date": date_str, "slots": []})

            slot_length = timedelta(minutes=resource.duration_minutes)
            day_start_local = datetime.combine(
                target_date, datetime.min.time(), tzinfo=tz
            )
            day_end_local = day_start_local + timedelta(days=1)
            day_end_naive = day_end_local.replace(tzinfo=None)
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
            reservations = resource_overlapping_reservations(
                resource, query_start, query_end
            )
            blocked_windows = resource_blocked_windows(
                resource, query_start, query_end, tz
            )
            windows = resource_availability_windows(resource, target_date)
            unconfigured = windows == FULL_DAY_WINDOWS

            buffer_before = timedelta(
                minutes=resource.booking_buffer_before_minutes
            )
            buffer_after = timedelta(
                minutes=resource.booking_buffer_after_minutes
            )
            min_notice = timedelta(hours=resource.min_booking_notice_hours)
            limit = (
                resource.capacity
                if (
                    resource.capacity_mode == Resource.CapacityMode.SHARED
                    and resource.capacity
                )
                else resource.quantity
            )

            slots = []
            for window_start_t, window_end_t in windows:
                cursor = datetime.combine(target_date, window_start_t)
                window_end = (
                    day_end_naive
                    if unconfigured
                    else datetime.combine(target_date, window_end_t)
                )
                while (
                    cursor < window_end
                    if unconfigured
                    else cursor + slot_length <= window_end
                ):
                    slot_end = cursor + slot_length
                    overlap_count = reservations_overlap_count(
                        reservations,
                        cursor - buffer_after,
                        slot_end + buffer_before,
                        tz,
                        resource.capacity_mode,
                    )
                    too_soon = cursor < now_local + min_notice
                    is_blocked = any(
                        cursor < b_end and slot_end > b_start
                        for b_start, b_end in blocked_windows
                    )
                    if (
                        overlap_count + 1 <= limit
                        and not too_soon
                        and not is_blocked
                    ):
                        slots.append(cursor.strftime("%H:%M"))
                    cursor += slot_length

            return Response({"date": date_str, "slots": slots})

        staff_id = request.query_params.get("staff")
        return compute_service_availability(
            workspace, service_id, date_str, staff_id
        )


def _get_public_workspace(workspace_slug):
    """Shared lookup for every guest-facing public-booking endpoint
    (BOOK-21/26/27/28/30) - a workspace that hasn't opted in via
    public_booking_enabled is 404, identical to it not existing, so
    the setting doubles as an access gate without needing its own
    permission class.
    """
    return generics.get_object_or_404(
        Workspace, slug=workspace_slug, public_booking_enabled=True
    )


class PublicWorkspaceView(APIView):
    """GET /api/public/<slug>/ - a guest's landing view of a
    workspace's booking page: branding plus its bookable services.
    Optional ?location=<id> narrows to services at just that
    Location, for a workspace with more than one (BOOK-06).
    """
    permission_classes = [AllowAny]

    def get(self, request, workspace_slug):
        workspace = _get_public_workspace(workspace_slug)
        services = Service.objects.filter(workspace=workspace, is_active=True)
        location_id = request.query_params.get("location")
        if location_id:
            services = services.filter(location_ref_id=location_id)
        return Response({
            "workspace": PublicWorkspaceSerializer(workspace).data,
            "services": ServiceSerializer(services, many=True).data,
            "locations": LocationSerializer(
                Location.objects.filter(workspace=workspace, is_active=True),
                many=True,
            ).data,
        })


class PublicAvailabilityView(APIView):
    """GET /api/public/<slug>/availability/?service=<id>&date=YYYY-MM-DD
    (&staff=<id> optional) - the exact same slot logic and rules an
    authenticated client sees (see compute_service_availability),
    just reached without an account.
    """
    permission_classes = [AllowAny]

    def get(self, request, workspace_slug):
        workspace = _get_public_workspace(workspace_slug)
        service_id = request.query_params.get("service")
        date_str = request.query_params.get("date")
        if not service_id or not date_str:
            return Response(
                {"detail": "service and date are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        staff_id = request.query_params.get("staff")
        return compute_service_availability(
            workspace, service_id, date_str, staff_id
        )


class PublicBookingCreateView(generics.CreateAPIView):
    """POST /api/public/<slug>/bookings/ - lets a guest book a
    service without an account (BOOK-21), enforcing every rule a
    logged-in client's booking would (capacity, buffers, notice,
    blocked time, caps) via PublicBookingSerializer.
    """
    serializer_class = PublicBookingSerializer
    permission_classes = [AllowAny]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = _get_public_workspace(
            self.kwargs["workspace_slug"]
        )
        return context

    def perform_create(self, serializer):
        booking = serializer.save()
        booked_name = booking.display_name
        log_activity(
            booking.workspace,
            None,
            "booking_created",
            booking,
            client=booking.client,
        )
        _send_booking_email(
            subject=f"Booking confirmed: {booked_name}",
            message=(
                f"Your booking for {booked_name} is confirmed for "
                f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}."
                f"\n\nIf you need to cancel or reschedule, contact "
                f"{booking.workspace.name} directly."
            ),
            booking=booking,
        )
