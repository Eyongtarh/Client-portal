from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .serializers import (
    AcceptInviteSerializer,
    ClientInviteCreateSerializer,
    MeSerializer,
    RegisterSerializer,
)


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
