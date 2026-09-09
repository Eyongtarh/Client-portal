"""Helper for writing Activity audit-trail entries. Kept separate
from views.py so instrumenting a new action is always a single,
consistent one-line call rather than hand-rolled Activity.objects.
create() calls scattered around with slightly different shapes.
"""
from .models import Activity


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
