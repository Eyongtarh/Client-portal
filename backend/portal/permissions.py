from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsOwnerOrStaffForWrite(BasePermission):
    """Read access follows whatever the view's own get_queryset()
    already scopes to (which, for a client, is correctly just their
    own records) - this permission only gates the unsafe methods
    (POST/PUT/PATCH/DELETE), restricting them to the workspace
    owner/staff. Use this on any viewset where a client's only
    legitimate way to affect the record is through a dedicated,
    narrowly-scoped action (e.g. paying an invoice via
    InvoiceCheckoutView, deciding an approval via
    ApprovalDecisionView) rather than a free-form PATCH that could
    let them rewrite fields like status or amounts directly.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("owner", "staff")
        )
