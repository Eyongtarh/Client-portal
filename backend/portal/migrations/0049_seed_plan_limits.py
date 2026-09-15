from django.db import migrations


def seed_limits(apps, schema_editor):
    """LIMIT-01/02/03: give the three seeded plans (see
    0023_seed_subscription_plans) sensible tiers for the new
    project/booking/storage limits, matching the same tiering
    philosophy as their existing client/team-member limits - Free
    is small, Pro is comfortably larger, Business is unlimited.
    Workspaces on a custom plan (not one of these three) are
    untouched.
    """
    SubscriptionPlan = apps.get_model("portal", "SubscriptionPlan")
    SubscriptionPlan.objects.filter(name="Free").update(
        max_projects=10, max_bookings_per_month=50, max_storage_mb=500,
    )
    SubscriptionPlan.objects.filter(name="Pro").update(
        max_projects=50, max_bookings_per_month=500, max_storage_mb=5000,
    )
    SubscriptionPlan.objects.filter(name="Business").update(
        max_projects=None, max_bookings_per_month=None, max_storage_mb=None,
    )


def unseed_limits(apps, schema_editor):
    """Nothing to revert - the fields themselves are removed by
    reversing 0048, and their values become moot once that happens."""


class Migration(migrations.Migration):

    dependencies = [
        ("portal", "0048_subscriptionplan_max_bookings_per_month_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_limits, unseed_limits),
    ]
