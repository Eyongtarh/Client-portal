from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
    BlockedTime, Client, ClientInvite, Location, Resource,
    ResourceAvailability, ResourceRental, ResourceRentalPolicy,
    ResourceReservation, ServiceResourceRequirement, Subscription,
    SubscriptionPlan, User, Workspace, Service, Booking, WorkingHours,
)


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """Admin config for the custom User model."""

    list_display = ("email", "username", "role", "is_staff")
    ordering = ("email",)
    fieldsets = UserAdmin.fieldsets + (
        ("Role", {"fields": ("role",)}),
    )


@admin.register(ClientInvite)
class ClientInviteAdmin(admin.ModelAdmin):
    """Shows the invite token read-only, since it's auto-generated."""

    list_display = ("email", "company_name", "accepted", "expires_at")
    readonly_fields = ("token", "created_at")


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    """Where an admin connects each paid plan to its real Stripe
    Price (SUB-02) - see SubscriptionPlan.stripe_price_id. The seed
    migration (0052) fills this in automatically only when
    STRIPE_PRICE_ID_PRO/_BUSINESS were set at migrate time.
    """

    list_display = (
        "name", "price_per_month", "stripe_price_id", "max_clients",
        "max_team_members",
    )


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    """Read-only: every field here is written by webhooks.py once
    Stripe confirms something happened, never edited by hand.
    """

    list_display = (
        "workspace", "status", "plan", "current_period_end",
        "cancel_at_period_end",
    )
    readonly_fields = [f.name for f in Subscription._meta.fields]

    def has_add_permission(self, request):
        return False


admin.site.register(Workspace)
admin.site.register(Client)
admin.site.register(Service)
admin.site.register(Booking)
admin.site.register(WorkingHours)
admin.site.register(BlockedTime)
admin.site.register(Location)
admin.site.register(Resource)
admin.site.register(ResourceAvailability)
admin.site.register(ResourceReservation)
admin.site.register(ResourceRentalPolicy)
admin.site.register(ResourceRental)
admin.site.register(ServiceResourceRequirement)
