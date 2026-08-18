from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Client, User, Workspace


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """Admin config for the custom User model."""
    list_display = ("email", "username", "role", "is_staff")
    ordering = ("email",)
    fieldsets = UserAdmin.fieldsets + (
        ("Role", {"fields": ("role",)}),
    )


admin.site.register(Workspace)
admin.site.register(Client)
