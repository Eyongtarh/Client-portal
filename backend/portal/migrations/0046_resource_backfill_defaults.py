from django.db import migrations


def backfill_resource_defaults(apps, schema_editor):
    """Existing resources predate reservation_mode/pricing_mode/
    status/capacity_mode - set them to values that match how those
    resources already behaved before this feature existed, so
    nothing changes for a workspace that doesn't touch the new
    fields. See the Resource Reservation System plan's Migrations
    section for the reasoning behind each default.
    """
    Resource = apps.get_model("portal", "Resource")
    Resource.objects.filter(price__isnull=False).update(pricing_mode="per_use")
    Resource.objects.filter(price__isnull=True).update(pricing_mode="none")
    Resource.objects.all().update(
        reservation_mode="reservation",
        status="available",
        capacity_mode="exclusive",
    )


def noop_reverse(apps, schema_editor):
    """Nothing to revert - the fields themselves are removed by
    reversing migration 0045, and their values become moot once
    that happens."""


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0045_blockedtime_block_type_blockedtime_resource_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_resource_defaults, noop_reverse),
    ]
