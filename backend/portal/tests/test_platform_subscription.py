"""Platform subscription billing (SUB-01..15) - the workspace owner
paying the platform for Pro/Business through Stripe, entirely
separate from Stripe Connect (client -> workspace payments, see
test_stripe_connect.py/test_payments.py). Covers: starting a paid
plan via Checkout, switching between two paid plans in place,
cancelling, and the webhook events that keep the local Subscription
row and workspace.plan in sync with Stripe.
"""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone

from portal.models import (
    Subscription, SubscriptionPlan, User, Workspace,
)
from portal.tests.helpers import auth_client


class PlatformSubscriptionTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="pw12345678",
            role="owner",
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner, name="Acme"
        )
        self.staff = User.objects.create_user(
            username="staffer",
            email="staffer@example.com",
            password="pw12345678",
            role="staff",
            staff_workspace=self.workspace,
        )
        # Free/Pro/Business already exist from the seed migrations
        # (0023/0052) - reuse them rather than creating duplicates,
        # which would collide on the unique `name`.
        self.free = SubscriptionPlan.objects.get(name="Free")
        self.pro = SubscriptionPlan.objects.get(name="Pro")
        self.pro.stripe_price_id = "price_pro_test"
        self.pro.save(update_fields=["stripe_price_id"])
        self.business = SubscriptionPlan.objects.get(name="Business")
        self.business.stripe_price_id = "price_business_test"
        self.business.save(update_fields=["stripe_price_id"])
        self.workspace.plan = self.free
        self.workspace.save()


@override_settings(STRIPE_SECRET_KEY="sk_test_fake")
class SubscriptionCheckoutTests(PlatformSubscriptionTestCase):
    def test_staff_cannot_start_checkout(self):
        res = auth_client(self.staff).post(
            "/api/workspace/subscription/checkout/",
            {"plan_id": self.pro.id},
        )
        self.assertEqual(res.status_code, 403)

    def test_checkout_blocked_without_stripe_secret_key(self):
        with override_settings(STRIPE_SECRET_KEY=""):
            res = auth_client(self.owner).post(
                "/api/workspace/subscription/checkout/",
                {"plan_id": self.pro.id},
            )
        self.assertEqual(res.status_code, 400)

    def test_checkout_blocked_for_free_plan(self):
        res = auth_client(self.owner).post(
            "/api/workspace/subscription/checkout/",
            {"plan_id": self.free.id},
        )
        self.assertEqual(res.status_code, 400)

    def test_checkout_blocked_when_plan_not_connected_to_stripe(self):
        unlinked = SubscriptionPlan.objects.create(
            name="Unlinked", price_per_month=Decimal("19.00"),
        )
        res = auth_client(self.owner).post(
            "/api/workspace/subscription/checkout/",
            {"plan_id": unlinked.id},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Stripe", str(res.data))

    @patch("portal.platform_billing.stripe.checkout.Session.create")
    @patch("portal.platform_billing.stripe.Customer.create")
    def test_owner_gets_checkout_url(self, mock_customer, mock_session):
        mock_customer.return_value = MagicMock(id="cus_test_1")
        mock_session.return_value = MagicMock(
            url="https://checkout.stripe.com/test-session"
        )
        res = auth_client(self.owner).post(
            "/api/workspace/subscription/checkout/",
            {"plan_id": self.pro.id},
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(
            res.data["url"], "https://checkout.stripe.com/test-session"
        )
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.stripe_customer_id, "cus_test_1")
        mock_session.assert_called_once()
        kwargs = mock_session.call_args.kwargs
        self.assertEqual(kwargs["mode"], "subscription")
        self.assertEqual(
            kwargs["line_items"][0]["price"], "price_pro_test"
        )

    @patch("portal.platform_billing.stripe.checkout.Session.create")
    @patch("portal.platform_billing.stripe.Customer.create")
    def test_checkout_reuses_existing_stripe_customer(
        self, mock_customer, mock_session
    ):
        self.workspace.stripe_customer_id = "cus_existing"
        self.workspace.save()
        mock_session.return_value = MagicMock(
            url="https://checkout.stripe.com/test-session"
        )
        auth_client(self.owner).post(
            "/api/workspace/subscription/checkout/",
            {"plan_id": self.pro.id},
        )
        mock_customer.assert_not_called()
        kwargs = mock_session.call_args.kwargs
        self.assertEqual(kwargs["customer"], "cus_existing")

    def test_checkout_blocked_with_existing_active_subscription(self):
        Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_existing",
            status=Subscription.Status.ACTIVE,
        )
        res = auth_client(self.owner).post(
            "/api/workspace/subscription/checkout/",
            {"plan_id": self.business.id},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Switch plan", str(res.data))


@override_settings(STRIPE_SECRET_KEY="sk_test_fake")
class ChangePlanStripeIntegrationTests(PlatformSubscriptionTestCase):
    @patch("portal.views.cancel_subscription")
    def test_switching_to_free_cancels_active_subscription_immediately(
        self, mock_cancel
    ):
        # Free is solo-owner-only (SUB-12/13) - drop the staff
        # member setUp created so the downgrade isn't blocked by
        # ChangePlanSerializer's own team-size check, which isn't
        # what this test is about.
        self.staff.delete()
        self.workspace.plan = self.pro
        self.workspace.save()
        subscription = Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_123",
            status=Subscription.Status.ACTIVE,
        )
        res = auth_client(self.owner).post(
            "/api/workspace/change-plan/", {"plan_id": self.free.id},
        )
        self.assertEqual(res.status_code, 200, res.data)
        mock_cancel.assert_called_once_with(
            subscription, at_period_end=False
        )
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.plan_id, self.free.id)
        subscription.refresh_from_db()
        self.assertEqual(subscription.status, Subscription.Status.CANCELED)

    @patch("portal.views.modify_subscription_price")
    def test_switching_between_paid_plans_updates_existing_subscription(
        self, mock_modify
    ):
        self.workspace.plan = self.pro
        self.workspace.save()
        Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_123",
            status=Subscription.Status.ACTIVE,
        )
        res = auth_client(self.owner).post(
            "/api/workspace/change-plan/", {"plan_id": self.business.id},
        )
        self.assertEqual(res.status_code, 200, res.data)
        mock_modify.assert_called_once_with(
            mock_modify.call_args.args[0], "price_business_test"
        )
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.plan_id, self.business.id)

    def test_starting_a_paid_plan_without_checkout_is_blocked(self):
        res = auth_client(self.owner).post(
            "/api/workspace/change-plan/", {"plan_id": self.pro.id},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("checkout", str(res.data))


@override_settings(STRIPE_SECRET_KEY="sk_test_fake")
class SubscriptionCancelTests(PlatformSubscriptionTestCase):
    def test_cancel_without_subscription_is_rejected(self):
        res = auth_client(self.owner).post(
            "/api/workspace/subscription/cancel/"
        )
        self.assertEqual(res.status_code, 400)

    @patch("portal.views.cancel_subscription")
    def test_owner_cancels_at_period_end(self, mock_cancel):
        subscription = Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_123",
            status=Subscription.Status.ACTIVE,
        )
        res = auth_client(self.owner).post(
            "/api/workspace/subscription/cancel/"
        )
        self.assertEqual(res.status_code, 200, res.data)
        mock_cancel.assert_called_once_with(
            subscription, at_period_end=True
        )
        subscription.refresh_from_db()
        self.assertTrue(subscription.cancel_at_period_end)
        # Cancelling at period end keeps the paid plan active in the
        # meantime - only the webhook, once Stripe confirms the
        # period actually ended, reverts workspace.plan.
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.plan_id, self.free.id)

    def test_staff_cannot_cancel(self):
        Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_123",
            status=Subscription.Status.ACTIVE,
        )
        res = auth_client(self.staff).post(
            "/api/workspace/subscription/cancel/"
        )
        self.assertEqual(res.status_code, 403)


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_fake")
class SubscriptionWebhookTests(PlatformSubscriptionTestCase):
    def _post_event(self, event):
        with patch(
            "portal.webhooks.stripe.Webhook.construct_event"
        ) as mock_construct:
            mock_construct.return_value = event
            return self.client.post(
                "/api/stripe/webhook/",
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="fake",
            )

    class _FakeSession(dict):
        def to_dict(self):
            return dict(self)

    @patch("portal.webhooks.stripe.Subscription.retrieve")
    def test_subscription_checkout_completed_upgrades_workspace(
        self, mock_retrieve
    ):
        mock_retrieve.return_value = {
            "id": "sub_new",
            "status": "active",
            "current_period_end": int(
                (timezone.now() + timezone.timedelta(days=30)).timestamp()
            ),
            "cancel_at_period_end": False,
            "items": {
                "data": [{"price": {"id": "price_pro_test"}}]
            },
        }
        event = {
            "id": "evt_checkout_sub",
            "type": "checkout.session.completed",
            "data": {
                "object": self._FakeSession(
                    {
                        "mode": "subscription",
                        "subscription": "sub_new",
                        "metadata": {
                            "workspace_id": str(self.workspace.id),
                            "plan_id": str(self.pro.id),
                        },
                    }
                )
            },
        }
        res = self._post_event(event)
        self.assertEqual(res.status_code, 200)
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.plan_id, self.pro.id)
        subscription = self.workspace.subscription
        self.assertEqual(subscription.stripe_subscription_id, "sub_new")
        self.assertEqual(subscription.status, "active")

    @patch("portal.webhooks.stripe.Subscription.retrieve")
    def test_duplicate_webhook_event_is_processed_once(
        self, mock_retrieve
    ):
        mock_retrieve.return_value = {
            "id": "sub_new",
            "status": "active",
            "current_period_end": None,
            "cancel_at_period_end": False,
            "items": {"data": [{"price": {"id": "price_pro_test"}}]},
        }
        event = {
            "id": "evt_dupe",
            "type": "checkout.session.completed",
            "data": {
                "object": self._FakeSession(
                    {
                        "mode": "subscription",
                        "subscription": "sub_new",
                        "metadata": {
                            "workspace_id": str(self.workspace.id),
                            "plan_id": str(self.pro.id),
                        },
                    }
                )
            },
        }
        self._post_event(event)
        self._post_event(event)
        self.assertEqual(mock_retrieve.call_count, 1)

    def test_subscription_deleted_reverts_workspace_to_free(self):
        self.workspace.plan = self.pro
        self.workspace.stripe_customer_id = "cus_test"
        self.workspace.save()
        Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_ending",
            status=Subscription.Status.ACTIVE,
        )
        event = {
            "id": "evt_sub_deleted",
            "type": "customer.subscription.deleted",
            "data": {
                "object": self._FakeSession(
                    {
                        "id": "sub_ending",
                        "customer": "cus_test",
                        "status": "canceled",
                        "current_period_end": None,
                        "cancel_at_period_end": False,
                        "metadata": {},
                        "items": {
                            "data": [{"price": {"id": "price_pro_test"}}]
                        },
                    }
                )
            },
        }
        res = self._post_event(event)
        self.assertEqual(res.status_code, 200)
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.plan_id, self.free.id)
        self.workspace.subscription.refresh_from_db()
        self.assertEqual(
            self.workspace.subscription.status, "canceled"
        )

    def test_subscription_past_due_does_not_downgrade_plan(self):
        self.workspace.plan = self.pro
        self.workspace.stripe_customer_id = "cus_test"
        self.workspace.save()
        Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_pastdue",
            status=Subscription.Status.ACTIVE,
        )
        event = {
            "id": "evt_sub_pastdue",
            "type": "customer.subscription.updated",
            "data": {
                "object": self._FakeSession(
                    {
                        "id": "sub_pastdue",
                        "customer": "cus_test",
                        "status": "past_due",
                        "current_period_end": None,
                        "cancel_at_period_end": False,
                        "metadata": {},
                        "items": {
                            "data": [{"price": {"id": "price_pro_test"}}]
                        },
                    }
                )
            },
        }
        res = self._post_event(event)
        self.assertEqual(res.status_code, 200)
        self.workspace.refresh_from_db()
        # past_due keeps the current plan (Stripe's own retry
        # schedule gets a chance to recover the payment) - only
        # canceled/incomplete_expired/unpaid revert to Free.
        self.assertEqual(self.workspace.plan_id, self.pro.id)
        self.workspace.subscription.refresh_from_db()
        self.assertEqual(
            self.workspace.subscription.status, "past_due"
        )


@override_settings(STRIPE_SECRET_KEY="sk_test_fake")
class SubscriptionWebhookHardeningTests(SubscriptionWebhookTests):
    """Audit follow-ups: retry safety, stale/duplicate events, and
    robustness against Stripe payload shapes. Inherits the event
    posting helpers (and re-runs the parent's tests, which is cheap
    and confirms the hardening didn't change the happy paths).
    """

    def _checkout_event(self, event_id, sub_id="sub_new", **session):
        return {
            "id": event_id,
            "type": "checkout.session.completed",
            "data": {
                "object": self._FakeSession(
                    {
                        "mode": "subscription",
                        "subscription": sub_id,
                        "metadata": {
                            "workspace_id": str(self.workspace.id),
                            "plan_id": str(self.pro.id),
                        },
                        **session,
                    }
                )
            },
        }

    def _stripe_sub(self, sub_id="sub_new", status="active", **extra):
        return {
            "id": sub_id,
            "status": status,
            "current_period_end": None,
            "cancel_at_period_end": False,
            "metadata": {},
            "items": {"data": [{"price": {"id": "price_pro_test"}}]},
            **extra,
        }

    @patch("portal.webhooks.stripe.Subscription.retrieve")
    def test_failed_handler_is_retried_not_swallowed(self, mock_retrieve):
        from portal.models import ProcessedStripeEvent

        self.client.raise_request_exception = False
        mock_retrieve.side_effect = RuntimeError("Stripe timed out")
        event = self._checkout_event("evt_retry")
        first = self._post_event(event)
        self.assertEqual(first.status_code, 500)
        self.assertFalse(
            ProcessedStripeEvent.objects.filter(event_id="evt_retry").exists()
        )
        # Stripe's retry of the same event must now succeed.
        mock_retrieve.side_effect = None
        mock_retrieve.return_value = self._stripe_sub()
        second = self._post_event(event)
        self.assertEqual(second.status_code, 200)
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.plan_id, self.pro.id)

    def test_stale_deleted_event_does_not_downgrade_resubscribed_owner(self):
        self.workspace.plan = self.pro
        self.workspace.stripe_customer_id = "cus_test"
        self.workspace.save()
        Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_current",
            status=Subscription.Status.ACTIVE,
        )
        event = {
            "id": "evt_old_deleted",
            "type": "customer.subscription.deleted",
            "data": {
                "object": self._FakeSession(
                    self._stripe_sub(
                        "sub_old", "canceled", customer="cus_test",
                        metadata={"workspace_id": str(self.workspace.id)},
                    )
                )
            },
        }
        self._post_event(event)
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.plan_id, self.pro.id)
        self.assertEqual(
            self.workspace.subscription.stripe_subscription_id,
            "sub_current",
        )
        self.assertEqual(self.workspace.subscription.status, "active")

    @patch("portal.webhooks.stripe.Subscription.delete")
    @patch("portal.webhooks.stripe.Subscription.retrieve")
    def test_second_checkout_cancels_duplicate_subscription(
        self, mock_retrieve, mock_delete
    ):
        Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_first",
            status=Subscription.Status.ACTIVE,
        )
        self._post_event(self._checkout_event("evt_dup", sub_id="sub_second"))
        mock_delete.assert_called_once_with("sub_second")
        mock_retrieve.assert_not_called()
        self.workspace.subscription.refresh_from_db()
        self.assertEqual(
            self.workspace.subscription.stripe_subscription_id, "sub_first"
        )

    @patch("portal.webhooks.stripe.Subscription.retrieve")
    def test_checkout_for_another_workspaces_customer_is_ignored(
        self, mock_retrieve
    ):
        self.workspace.stripe_customer_id = "cus_mine"
        self.workspace.save()
        self._post_event(
            self._checkout_event("evt_wrong_cust", customer="cus_other")
        )
        mock_retrieve.assert_not_called()
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.plan_id, self.free.id)

    def test_unknown_price_does_not_wipe_the_known_plan(self):
        self.workspace.plan = self.pro
        self.workspace.stripe_customer_id = "cus_test"
        self.workspace.save()
        Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_x",
            status=Subscription.Status.ACTIVE,
        )
        sub = self._stripe_sub("sub_x", customer="cus_test")
        sub["items"] = {"data": [{"price": {"id": "price_unmapped"}}]}
        self._post_event(
            {
                "id": "evt_unmapped",
                "type": "customer.subscription.updated",
                "data": {"object": self._FakeSession(sub)},
            }
        )
        self.workspace.subscription.refresh_from_db()
        self.assertEqual(self.workspace.subscription.plan_id, self.pro.id)

    def test_period_end_is_read_from_the_item_on_newer_api_versions(self):
        self.workspace.stripe_customer_id = "cus_test"
        self.workspace.save()
        ts = int((timezone.now() + timezone.timedelta(days=30)).timestamp())
        sub = self._stripe_sub("sub_item_end", customer="cus_test")
        sub["items"] = {
            "data": [
                {"price": {"id": "price_pro_test"}, "current_period_end": ts}
            ]
        }
        sub["metadata"] = {"workspace_id": str(self.workspace.id)}
        self._post_event(
            {
                "id": "evt_item_end",
                "type": "customer.subscription.updated",
                "data": {"object": self._FakeSession(sub)},
            }
        )
        self.assertIsNotNone(self.workspace.subscription.current_period_end)


class SubscriptionViewHardeningTests(PlatformSubscriptionTestCase):
    @override_settings(STRIPE_SECRET_KEY="sk_test_fake")
    def test_checkout_with_garbage_plan_id_is_a_400_not_a_500(self):
        client = auth_client(self.owner)
        res = client.post(
            "/api/workspace/subscription/checkout/", {"plan_id": "abc"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_cancel_is_rejected_once_the_subscription_has_ended(self):
        Subscription.objects.create(
            workspace=self.workspace,
            plan=self.pro,
            stripe_subscription_id="sub_done",
            status=Subscription.Status.CANCELED,
        )
        client = auth_client(self.owner)
        res = client.post(
            "/api/workspace/subscription/cancel/", format="json"
        )
        self.assertEqual(res.status_code, 400)

    @patch("portal.views.list_billing_history")
    def test_billing_history_totals_respect_zero_decimal_currencies(
        self, mock_history
    ):
        mock_history.return_value = [
            {"id": "in_1", "total": 5000, "currency": "xaf",
             "status": "paid", "hosted_invoice_url": None, "created": 1},
            {"id": "in_2", "total": 2900, "currency": "usd",
             "status": "paid", "hosted_invoice_url": None, "created": 2},
        ]
        client = auth_client(self.owner)
        res = client.get("/api/workspace/subscription/invoices/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()[0]["total"], 5000)
        self.assertEqual(res.json()[1]["total"], 29)

    def test_other_workspaces_owner_cannot_see_this_workspaces_state(self):
        other_owner = User.objects.create_user(
            username="other", email="other@example.com",
            password="pw12345678", role="owner",
        )
        Workspace.objects.create(owner=other_owner, name="Other")
        Subscription.objects.create(
            workspace=self.workspace, plan=self.pro,
            stripe_subscription_id="sub_mine",
            status=Subscription.Status.ACTIVE,
        )
        client = auth_client(other_owner)
        res = client.post(
            "/api/workspace/subscription/cancel/", format="json"
        )
        # They own a workspace with no subscription: nothing to cancel,
        # and crucially this workspace's subscription is untouched.
        self.assertEqual(res.status_code, 400)
        self.workspace.subscription.refresh_from_db()
        self.assertFalse(self.workspace.subscription.cancel_at_period_end)
