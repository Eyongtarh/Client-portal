import io
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.mail import send_mail
from django.http import FileResponse
from django.utils import timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import (
    Approval, Booking, Client, Document, Invoice, Message, Milestone,
    Project, RecurringSeries, Resource, Review, Service,
    SubscriptionPlan, Task, User, WaitlistEntry, WorkingHours,
)
from .serializers import (
    AcceptInviteSerializer,
    AcceptTeamInviteSerializer,
    ApprovalDecisionSerializer,
    ApprovalSerializer,
    BookingSerializer,
    ChangePlanSerializer,
    ClientInviteCreateSerializer,
    ClientSerializer,
    DocumentSerializer,
    InvoiceSerializer,
    MeSerializer,
    MessageSerializer,
    MilestoneSerializer,
    PasswordResetConfirmSerializer,
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
    """GET /api/auth/me/ - who is currently logged in."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = MeSerializer(request.user).data
        user = request.user
        if user.role in ("owner", "staff"):
            workspace = user.get_workspace()
            data["workspace_id"] = workspace.id
            data["workspace_name"] = workspace.name
        else:
            client = user.client_profile
            data["client_id"] = client.id
            data["company_name"] = client.company_name
        return Response(data)


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


class ProjectViewSet(viewsets.ModelViewSet):
    """Owners and staff manage their workspace's projects; clients
    see only their own project(s).
    """
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Project.objects.filter(workspace=user.get_workspace())
        return Project.objects.filter(client=user.client_profile)

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


class MilestoneViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as ProjectViewSet, scoped through
    the parent project.
    """
    serializer_class = MilestoneSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Milestone.objects.filter(
                project__workspace=user.get_workspace()
            )
        return Milestone.objects.filter(
            project__client=user.client_profile
        )


class TaskViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as MilestoneViewSet."""
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Task.objects.filter(
                project__workspace=user.get_workspace()
            )
        return Task.objects.filter(
            project__client=user.client_profile
        )


class ApprovalViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as TaskViewSet. Owners and
    staff can create/edit; clients get read-only access here and
    record their decision through the separate 'decide' action
    below.
    """
    serializer_class = ApprovalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Approval.objects.filter(
                project__workspace=user.get_workspace()
            )
        return Approval.objects.filter(
            project__client=user.client_profile
        )

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
        serializer.save()


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

        return Response(ApprovalSerializer(approval).data)


class DocumentViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as MilestoneViewSet. On create,
    we capture who uploaded it and the file's size automatically -
    the client never has to send those.
    """
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Document.objects.filter(
                project__workspace=user.get_workspace()
            )
        return Document.objects.filter(
            project__client=user.client_profile
        )

    def perform_create(self, serializer):
        uploaded_file = self.request.FILES.get("file")
        serializer.save(
            uploaded_by=self.request.user,
            original_name=uploaded_file.name if uploaded_file else "",
            size_bytes=uploaded_file.size if uploaded_file else 0,
        )


class MessageViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as the other project-scoped
    viewsets. The sender is always the logged-in user, never
    client-supplied.
    """
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Message.objects.filter(
                project__workspace=user.get_workspace()
            )
        return Message.objects.filter(
            project__client=user.client_profile
        )

    def perform_create(self, serializer):
        serializer.save(sender=self.request.user)


class InvoiceViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as the other workspace-scoped
    viewsets.
    """
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Invoice.objects.filter(workspace=user.get_workspace())
        return Invoice.objects.filter(client=user.client_profile)

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.get_workspace())


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


class ClientViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as the other workspace-scoped
    viewsets.
    """
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("owner", "staff"):
            return Client.objects.filter(workspace=user.get_workspace())
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
    showing as upcoming and becomes reviewable.
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
            return Booking.objects.filter(workspace=workspace)
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
            send_mail(
                subject=f"Booking cancelled: {booked_name}",
                message=(
                    f"Your booking for {booked_name} on "
                    f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}"
                    f" has been cancelled."
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
        serializer.save(
            workspace=booking.workspace,
            service=booking.service,
            client=user.client_profile,
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
        return Response(ReviewSerializer(review).data)


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
