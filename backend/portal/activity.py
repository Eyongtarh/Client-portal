"""Helper for writing Activity audit-trail entries. Kept separate
from views.py so instrumenting a new action is always a single,
consistent one-line call rather than hand-rolled Activity.objects.
create() calls scattered around with slightly different shapes.
"""
from .models import Activity

# The notification categories a user can mute (NOTIF-01/02) - each
# maps to the verb codes that belong to it. A verb with no category
# here (e.g. team/client-membership events) is never muted; it's
# not one of the notification types NOTIF-01 lists, so there's
# nothing for a preference to turn off.
NOTIFICATION_CATEGORIES = {
    "messages": ["message_sent"],
    "documents": ["document_uploaded"],
    "invoices": ["invoice_created", "invoice_sent"],
    "payments": ["invoice_paid", "booking_payment_received"],
    "bookings": [
        "booking_created", "booking_cancelled", "booking_cancelled_late",
        "booking_no_show", "resource_checked_out", "resource_checked_in",
    ],
    "approvals": [
        "approval_requested", "approval_approved",
        "approval_changes_requested",
    ],
    "projects": [
        "project_created", "project_status_changed", "milestone_completed",
        "task_completed",
    ],
}

VERB_TO_CATEGORY = {
    verb: category
    for category, verbs in NOTIFICATION_CATEGORIES.items()
    for verb in verbs
}


def log(workspace, actor, verb, obj, client=None, metadata=None):
    """Records one audit-trail entry.

    workspace: the tenant this event belongs to.
    actor: the User who performed the action (None for
        system-initiated events, e.g. a payment webhook).
    verb: a stable code, e.g. "invoice_paid" - the frontend maps
        this to a translated sentence, so it must match a key the
        frontend knows about (see locales *.json "activity.verbs").
    obj: the model instance the action was performed on. Its class
        name (lowercased) becomes target_type and str(obj) is
        snapshotted into target_repr.
    client: the Client this event should be visible to in their own
        portal. Leave unset for workspace-internal events (e.g. team
        management) that only the owner/staff should ever see.
    metadata: optional small dict of extra context for the frontend
        to interpolate into the sentence (e.g. {"amount": "120.00"}).
    """
    Activity.objects.create(
        workspace=workspace,
        actor=actor if getattr(actor, "pk", None) else None,
        client=client,
        verb=verb,
        target_type=obj.__class__.__name__.lower(),
        target_id=obj.pk,
        target_repr=str(obj)[:255],
        metadata=metadata or {},
    )
