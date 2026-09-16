from django.db import migrations


def update_limits(apps, schema_editor):
    """Retiers Free/Pro to match the current plan.md pricing table
    (Business was already unlimited and needs no change):

    Free: 1 team member (the owner - see 0023's original seed;
    later work elsewhere may have zeroed this for "solo owner
    only", but the plan copy's own bullet lists 1, not 0), 10
    clients (was 50), 5 projects (was 10), 50 bookings/month
    (unchanged), 500MB storage (unchanged).

    Pro: 50 clients (was 100), 25 projects (was 50); team members
    (5), bookings/month (500) and storage (5000MB) already matched
    and are left alone.
    """
    SubscriptionPlan = apps.get_model("portal", "SubscriptionPlan")
    SubscriptionPlan.objects.filter(name="Free").update(
        max_team_members=1, max_clients=10, max_projects=5,
    )
    SubscriptionPlan.objects.filter(name="Pro").update(
        max_clients=50, max_projects=25,
    )


def revert_limits(apps, schema_editor):
    SubscriptionPlan = apps.get_model("portal", "SubscriptionPlan")
    SubscriptionPlan.objects.filter(name="Free").update(
        max_team_members=0, max_clients=50, max_projects=10,
    )
    SubscriptionPlan.objects.filter(name="Pro").update(
        max_clients=100, max_projects=50,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("portal", "0050_alter_resource_location_alter_service_location_and_more"),
    ]

    operations = [
        migrations.RunPython(update_limits, revert_limits),
    ]
