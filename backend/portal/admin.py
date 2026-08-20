from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Client, ClientInvite, User, Workspace


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


admin.site.register(Workspace)
admin.site.register(Client)
