import io
from datetime import datetime, timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.http import FileResponse
from django.utils import timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Approval, Booking, Client, Document, Invoice, Message, Milestone,
    Project, Service, Task, WorkingHours,
)
from .serializers import (
    AcceptInviteSerializer,
    ApprovalDecisionSerializer,
    ApprovalSerializer,
    BookingSerializer,
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
    RegisterSerializer,
    ServiceSerializer,
    TaskSerializer,
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
        if request.user.role == "owner":
            data["workspace_id"] = request.user.workspace.id
            data["workspace_name"] = request.user.workspace.name
        else:
            client = request.user.client_profile
            data["client_id"] = client.id
            data["company_name"] = client.company_name
        return Response(data)


class InviteClientView(generics.CreateAPIView):
    """POST /api/invites/ - owner invites a client by email, then
    sends them a link to accept it and set up their account.
    """
    serializer_class = ClientInviteCreateSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        workspace = self.request.user.workspace
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


class WorkspaceUpdateView(generics.RetrieveUpdateAPIView):
    """GET /api/workspace/ - owner or client views their
    workspace (clients need this for currency/logo when
    booking). PATCH /api/workspace/ - owner-only update,
    including uploading a logo.
    """
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        user = self.request.user
        if user.role == "owner":
            return user.workspace
        return user.client_profile.workspace

    def update(self, request, *args, **kwargs):
        if request.user.role != "owner":
            raise PermissionDenied(
                "Only the owner can update the workspace."
            )
        return super().update(request, *args, **kwargs)


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
    """Owners manage their workspace's projects; clients see only
    their own project(s).
    """
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "owner":
            return Project.objects.filter(workspace=user.workspace)
        return Project.objects.filter(client=user.client_profile)

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.workspace)


class MilestoneViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as ProjectViewSet, scoped through
    the parent project.
    """
    serializer_class = MilestoneSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "owner":
            return Milestone.objects.filter(
                project__workspace=user.workspace
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
        if user.role == "owner":
            return Task.objects.filter(
                project__workspace=user.workspace
            )
        return Task.objects.filter(
            project__client=user.client_profile
        )


class ApprovalViewSet(viewsets.ModelViewSet):
    """Same tenant-scoping pattern as TaskViewSet. Owners can
    create/edit; clients get read-only access here and record
    their decision through the separate 'decide' action below.
    """
    serializer_class = ApprovalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "owner":
            return Approval.objects.filter(
                project__workspace=user.workspace
            )
        return Approval.objects.filter(
            project__client=user.client_profile
        )

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated()]
        return [IsAuthenticated()]

    def perform_update(self, serializer):
        # Owners edit title/description only; status/comment come
        # through the decide action, never a plain PATCH here.
        if self.request.user.role != "owner":
            raise PermissionDenied(
                "Only the owner can edit an approval request."
            )
        serializer.save()

    def perform_create(self, serializer):
        if self.request.user.role != "owner":
            raise PermissionDenied(
                "Only the owner can request an approval."
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
        if user.role == "owner":
            return Document.objects.filter(
                project__workspace=user.workspace
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
        if user.role == "owner":
            return Message.objects.filter(
                project__workspace=user.workspace
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
        if user.role == "owner":
            return Invoice.objects.filter(workspace=user.workspace)
        return Invoice.objects.filter(client=user.client_profile)

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.workspace)


class InvoicePDFView(APIView):
    """GET /api/invoices/<id>/pdf/ - renders the invoice as a
    downloadable PDF using reportlab.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        user = request.user
        if user.role == "owner":
            qs = Invoice.objects.filter(workspace=user.workspace)
        else:
            qs = Invoice.objects.filter(client=user.client_profile)
        invoice = generics.get_object_or_404(qs, pk=pk)
        buf = io.BytesIO()
        pdf = canvas.Canvas(buf, pagesize=A4)
        width, height = A4
        y = height - 30 * mm
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(20 * mm, y, f"Invoice #{invoice.number}")
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
        pdf.line(20 * mm, y, 190 * mm, y)
        y -= 8 * mm
        pdf.setFont("Helvetica", 11)
        for item in invoice.items.all():
            pdf.drawString(20 * mm, y, item.description[:60])
            pdf.drawRightString(
                190 * mm, y, f"\u20ac{item.amount:,.2f}"
            )
            y -= 7 * mm

        y -= 4 * mm
        pdf.line(20 * mm, y, 190 * mm, y)
        y -= 8 * mm
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawRightString(
            190 * mm, y, f"Total: \u20ac{invoice.total:,.2f}"
        )

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
        if user.role == "owner":
            return Client.objects.filter(workspace=user.workspace)
        return Client.objects.filter(id=user.client_profile.id)


class ServiceViewSet(viewsets.ModelViewSet):
    """Owners manage services; clients get read-only access so
    they can see what's bookable.
    """
    serializer_class = ServiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "owner":
            return Service.objects.filter(workspace=user.workspace)
        return Service.objects.filter(
            workspace=user.client_profile.workspace, is_active=True
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.workspace)


class WorkingHoursViewSet(viewsets.ModelViewSet):
    """Owners manage their weekly hours; clients get read-only
    access (used to render available days before picking a slot).
    """
    serializer_class = WorkingHoursSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "owner":
            return WorkingHours.objects.filter(
                workspace=user.workspace
            )
        return WorkingHours.objects.filter(
            workspace=user.client_profile.workspace
        )

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.workspace)


class BookingViewSet(viewsets.ModelViewSet):
    """Owners see/manage every booking in their workspace; clients
    see only their own and can only ever create bookings for
    themselves (client is forced here, never trusted from the
    request body). Sends a confirmation email on create and a
    cancellation email whenever a booking's status changes to
    cancelled.
    """
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "owner":
            return Booking.objects.filter(workspace=user.workspace)
        return Booking.objects.filter(client=user.client_profile)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == "owner":
            booking = serializer.save(workspace=user.workspace)
        else:
            booking = serializer.save(
                workspace=user.client_profile.workspace,
                client=user.client_profile,
            )
        send_mail(
            subject=f"Booking confirmed: {booking.service.name}",
            message=(
                f"Your booking for {booking.service.name} is "
                f"confirmed for "
                f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}."
                f"\n\nIf you need to cancel or reschedule, do so "
                f"from your client portal."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[booking.client.contact_email],
            fail_silently=True,
        )

    def perform_update(self, serializer):
        booking = serializer.save()
        if booking.status == "cancelled":
            send_mail(
                subject=f"Booking cancelled: {booking.service.name}",
                message=(
                    f"Your booking for {booking.service.name} on "
                    f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}"
                    f" has been cancelled."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[booking.client.contact_email],
                fail_silently=True,
            )


class AvailabilityView(APIView):
    """GET /api/availability/?service=<id>&date=YYYY-MM-DD
    Returns open time slots for that service on that date, by
    taking the workspace's working hours for that weekday and
    subtracting any already-confirmed bookings.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        service_id = request.query_params.get("service")
        date_str = request.query_params.get("date")
        if not service_id or not date_str:
            return Response(
                {"detail": "service and date are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        workspace = (
            user.workspace
            if user.role == "owner"
            else user.client_profile.workspace
        )
        service = generics.get_object_or_404(
            Service, pk=service_id, workspace=workspace
        )
        target_date = datetime.strptime(
            date_str, "%Y-%m-%d"
        ).date()
        weekday = target_date.weekday()

        windows = WorkingHours.objects.filter(
            workspace=workspace, weekday=weekday
        )
        existing = Booking.objects.filter(
            workspace=workspace,
            status="confirmed",
            start_time__date=target_date,
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
                overlaps = any(
                    cursor < b.end_time.replace(tzinfo=None)
                    and slot_end > b.start_time.replace(tzinfo=None)
                    for b in existing
                )
                if not overlaps:
                    slots.append(cursor.strftime("%H:%M"))
                cursor += slot_length

        return Response({"date": date_str, "slots": slots})
