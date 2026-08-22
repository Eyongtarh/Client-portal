from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from . import views

router = DefaultRouter()
router.register("projects", views.ProjectViewSet, basename="project")
router.register(
    "milestones", views.MilestoneViewSet, basename="milestone"
)
router.register(
    "documents", views.DocumentViewSet, basename="document"
)
router.register("messages", views.MessageViewSet, basename="message")
router.register("invoices", views.InvoiceViewSet, basename="invoice")

urlpatterns = [
    path("auth/register/", views.RegisterView.as_view()),
    path("auth/login/", TokenObtainPairView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/me/", views.MeView.as_view()),
    path("auth/accept-invite/", views.AcceptInviteView.as_view()),
    path("invites/", views.InviteClientView.as_view()),
    path(
        "invoices/<int:pk>/pdf/", views.InvoicePDFView.as_view()
    ),
    path("", include(router.urls)),
]
