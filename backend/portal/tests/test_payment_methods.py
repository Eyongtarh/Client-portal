"""Manual payment methods (Mobile Money, bank transfer, etc.) a
workspace publishes for clients who can't pay by card - see
PaymentMethod. The only invariant that matters here is who can
write: a client reads these to know how to pay, but must never be
able to plant or alter an owner's own payout details.
"""
from django.test import TestCase

from portal.models import Client, PaymentMethod, User, Workspace
from portal.tests.helpers import auth_client


class PaymentMethodTestCase(TestCase):
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
            username="staff",
            email="staff@example.com",
            password="pw12345678",
            role="staff",
            staff_workspace=self.workspace,
        )
        self.client_user = User.objects.create_user(
            username="client",
            email="client@example.com",
            password="pw12345678",
            role="client",
        )
        self.client_profile = Client.objects.create(
            workspace=self.workspace,
            user=self.client_user,
            company_name="Client Co",
            contact_email="client@example.com",
        )


class PaymentMethodCrudTests(PaymentMethodTestCase):
    def test_owner_can_create(self):
        res = auth_client(self.owner).post(
            "/api/payment-methods/",
            {
                "name": "MTN Mobile Money",
                "account_details": "+237 6XX XXX XXX, Sarah Beauty Salon",
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(
            PaymentMethod.objects.get().workspace, self.workspace
        )

    def test_staff_can_create(self):
        res = auth_client(self.staff).post(
            "/api/payment-methods/",
            {"name": "Orange Money", "account_details": "+237 6YY YYY YYY"},
        )
        self.assertEqual(res.status_code, 201, res.data)

    def test_client_cannot_create(self):
        res = auth_client(self.client_user).post(
            "/api/payment-methods/",
            {"name": "Orange Money", "account_details": "+237 6YY YYY YYY"},
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(PaymentMethod.objects.count(), 0)

    def test_client_can_list_workspace_methods(self):
        PaymentMethod.objects.create(
            workspace=self.workspace,
            name="MTN Mobile Money",
            account_details="+237 6XX XXX XXX",
        )
        res = auth_client(self.client_user).get("/api/payment-methods/")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(res.data), 1)

    def test_owner_can_edit(self):
        method = PaymentMethod.objects.create(
            workspace=self.workspace,
            name="MTN Mobile Money",
            account_details="+237 6XX XXX XXX",
        )
        res = auth_client(self.owner).patch(
            f"/api/payment-methods/{method.id}/",
            {"account_details": "+237 6ZZ ZZZ ZZZ"},
        )
        self.assertEqual(res.status_code, 200, res.data)
        method.refresh_from_db()
        self.assertEqual(method.account_details, "+237 6ZZ ZZZ ZZZ")

    def test_client_cannot_edit(self):
        method = PaymentMethod.objects.create(
            workspace=self.workspace,
            name="MTN Mobile Money",
            account_details="+237 6XX XXX XXX",
        )
        res = auth_client(self.client_user).patch(
            f"/api/payment-methods/{method.id}/",
            {"account_details": "hijacked"},
        )
        self.assertEqual(res.status_code, 403)
        method.refresh_from_db()
        self.assertEqual(method.account_details, "+237 6XX XXX XXX")

    def test_owner_can_delete(self):
        method = PaymentMethod.objects.create(
            workspace=self.workspace,
            name="MTN Mobile Money",
            account_details="+237 6XX XXX XXX",
        )
        res = auth_client(self.owner).delete(
            f"/api/payment-methods/{method.id}/"
        )
        self.assertEqual(res.status_code, 204)
        self.assertEqual(PaymentMethod.objects.count(), 0)

    def test_other_workspace_cannot_see_or_edit(self):
        method = PaymentMethod.objects.create(
            workspace=self.workspace,
            name="MTN Mobile Money",
            account_details="+237 6XX XXX XXX",
        )
        other_owner = User.objects.create_user(
            username="otherowner",
            email="otherowner@example.com",
            password="pw12345678",
            role="owner",
        )
        Workspace.objects.create(owner=other_owner, name="Other Co")
        res = auth_client(other_owner).get("/api/payment-methods/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 0)
        res = auth_client(other_owner).patch(
            f"/api/payment-methods/{method.id}/",
            {"account_details": "hijacked"},
        )
        self.assertEqual(res.status_code, 404)
