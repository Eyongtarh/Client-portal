from rest_framework.permissions import SAFE_METHODS, BasePermission


def staff_scope(qs, user, path=""):
    """TEAM-02: a staff member with User.restricted=True only sees
    rows tied to a client they're assigned to (Client.assigned_staff),
    not the whole workspace - everything in this app hangs off a
    Client (see Client.assigned_staff's own docstring), so a single
    `path` lookup covers every model. A no-op for the owner and for
    unrestricted staff (the default), so nothing changes for anyone
    who hasn't opted a team member into this.

    `path` is the Django lookup prefix from `qs`'s model to Client:
    "" for Client itself, "client" for anything with a direct client
    FK (Booking, Invoice, Review, ...), "project__client" for
    anything hanging off a Project (Task, Document, Message, ...).
    """
    if user.role != "staff" or not user.restricted:
        return qs
    key = f"{path}__assigned_staff" if path else "assigned_staff"
    return qs.filter(**{key: user})


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
