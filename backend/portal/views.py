from rest_framework import generics, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Document, Invoice, Message, Milestone, Project
from .serializers import (
    AcceptInviteSerializer,
    ClientInviteCreateSerializer,
    DocumentSerializer,
    InvoiceSerializer,
    MeSerializer,
    MessageSerializer,
    MilestoneSerializer,
    ProjectSerializer,
    RegisterSerializer,
)
import io
from django.http import FileResponse
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ - owner sign-up."""
    serializer_class = RegisterSerializer
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
        return Response(data)


class InviteClientView(generics.CreateAPIView):
    """POST /api/invites/ - owner invites a client by email."""

    serializer_class = ClientInviteCreateSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(workspace=self.request.user.workspace)


class AcceptInviteView(generics.CreateAPIView):
    """POST /api/auth/accept-invite/ - client sets a password using
    their invite token and gets an account.
    """
    serializer_class = AcceptInviteSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client = serializer.save()
        return Response(
            {"company_name": client.company_name},
            status=status.HTTP_201_CREATED,
        )


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
