from django.db import migrations


def seed_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model("portal", "SubscriptionPlan")
    Workspace = apps.get_model("portal", "Workspace")

    free, _ = SubscriptionPlan.objects.get_or_create(
        name="Free",
        defaults={
            "price_per_month": 0,
            "max_clients": 50,
            "max_team_members": 1,
        },
    )
    SubscriptionPlan.objects.get_or_create(
        name="Pro",
        defaults={
            "price_per_month": 29,
            "max_clients": 100,
            "max_team_members": 5,
        },
    )
    SubscriptionPlan.objects.get_or_create(
        name="Business",
        defaults={
            "price_per_month": 79,
            "max_clients": None,
            "max_team_members": None,
        },
    )
    # Every existing workspace starts on Free until they choose
    # otherwise.
    Workspace.objects.filter(plan__isnull=True).update(plan=free)


def unseed_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model("portal", "SubscriptionPlan")
    SubscriptionPlan.objects.filter(
        name__in=["Free", "Pro", "Business"]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("portal", "0022_subscriptionplan_workspace_plan"),
    ]

    operations = [
        migrations.RunPython(seed_plans, unseed_plans),
    ]
