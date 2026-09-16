from decouple import config
from django.db import migrations


def seed_billing(apps, schema_editor):
    """Seeds each paid plan's stripe_price_id from the
    STRIPE_PRICE_ID_PRO / STRIPE_PRICE_ID_BUSINESS environment
    variables, when set, so a deploy with them already configured
    can take real checkouts immediately - see platform_billing.py.
    Left blank (the field's default) when unset; checkout then fails
    with a clear, specific error instead of crashing (see
    views.PlatformSubscriptionCheckoutView), and the price can be
    set later from /admin/.
    """
    SubscriptionPlan = apps.get_model("portal", "SubscriptionPlan")
    pro_price = config("STRIPE_PRICE_ID_PRO", default="")
    if pro_price:
        SubscriptionPlan.objects.filter(name="Pro").update(
            stripe_price_id=pro_price
        )
    business_price = config("STRIPE_PRICE_ID_BUSINESS", default="")
    if business_price:
        SubscriptionPlan.objects.filter(name="Business").update(
            stripe_price_id=business_price
        )


def unseed_billing(apps, schema_editor):
    """Nothing to undo: the price ids are environment driven, not
    app data, and the field itself is removed by reversing 0052.
    """


class Migration(migrations.Migration):

    dependencies = [
        ("portal", "0052_platform_subscription_billing"),
    ]

    operations = [
        migrations.RunPython(seed_billing, unseed_billing),
    ]
