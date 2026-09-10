from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from . import views, webhooks

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
router.register("clients", views.ClientViewSet, basename="client")
router.register("tasks", views.TaskViewSet, basename="task")
router.register(
    "approvals", views.ApprovalViewSet, basename="approval"
)
router.register(
    "services", views.ServiceViewSet, basename="service"
)
router.register(
    "working-hours", views.WorkingHoursViewSet, basename="workinghours"
)
router.register(
    "bookings", views.BookingViewSet, basename="booking"
)
router.register(
    "waitlist", views.WaitlistEntryViewSet, basename="waitlist"
)
router.register(
    "reviews", views.ReviewViewSet, basename="review"
)
router.register(
    "team", views.TeamViewSet, basename="team"
)
router.register(
    "plans", views.SubscriptionPlanViewSet, basename="plan"
)
router.register(
    "resources", views.ResourceViewSet, basename="resource"
)
router.register(
    "payment-methods", views.PaymentMethodViewSet, basename="paymentmethod"
)
router.register(
    "activities", views.ActivityViewSet, basename="activity"
)

urlpatterns = [
    path("auth/register/", views.RegisterView.as_view()),
    path("auth/login/", TokenObtainPairView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/me/", views.MeView.as_view()),
    path(
        "auth/change-password/", views.ChangePasswordView.as_view()
    ),
    path("auth/accept-invite/", views.AcceptInviteView.as_view()),
    path(
        "auth/password-reset/",
        views.PasswordResetRequestView.as_view(),
    ),
    path(
        "auth/password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
    ),
    path(
        "workspace/", views.WorkspaceUpdateView.as_view()
    ),
    path(
        "workspace/change-plan/",
        views.ChangePlanView.as_view(),
    ),
    path(
        "workspace/stripe/connect/",
        views.WorkspaceStripeConnectStartView.as_view(),
    ),
    path(
        "workspace/stripe/connect/callback/",
        views.WorkspaceStripeConnectCallbackView.as_view(),
    ),
    path(
        "workspace/stripe/connect/disconnect/",
        views.WorkspaceStripeConnectDisconnectView.as_view(),
    ),
    path("countries/", views.CountriesView.as_view()),
    path("invites/", views.InviteClientView.as_view()),
    path(
        "approvals/<int:pk>/decide/",
        views.ApprovalDecisionView.as_view(),
    ),
    path("team-invites/", views.TeamInviteView.as_view()),
    path(
        "auth/accept-team-invite/",
        views.AcceptTeamInviteView.as_view(),
    ),
    path(
        "invoices/<int:pk>/pdf/", views.InvoicePDFView.as_view()
    ),
    path(
        "invoices/<int:pk>/checkout/",
        views.InvoiceCheckoutView.as_view(),
    ),
    path(
        "bookings/<int:pk>/checkout/",
        views.BookingCheckoutView.as_view(),
    ),
    path("stripe/webhook/", webhooks.StripeWebhookView.as_view()),
    path(
        "stripe/connect-webhook/",
        webhooks.StripeConnectWebhookView.as_view(),
    ),
    path("search/", views.SearchView.as_view()),
    path("", include(router.urls)),
    path("availability/", views.AvailabilityView.as_view()),
    path(
        "recurring-series/",
        views.RecurringSeriesCreateView.as_view(),
    ),
    path(
        "recurring-series/<int:pk>/cancel/",
        views.RecurringSeriesCancelView.as_view(),
    ),
]
