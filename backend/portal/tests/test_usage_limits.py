"""LIMIT-01/02/03: storage, project, and booking usage limits on top
of the pre-existing client/team-member ones. Each limit is null by
default (unlimited) so a workspace on no plan, or a plan that leaves
a field blank, is never blocked - only a plan that explicitly sets a
limit enforces it.
"""
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from portal.models import (
    Client, Project, Service, SubscriptionPlan, User, Workspace,
)
from portal.tests.helpers import auth_client

LOCAL_STORAGE = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}


class UsageLimitTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com",
            password="pw12345678", role="owner",
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner, name="Acme"
        )
        self.client_profile = Client.objects.create(
            workspace=self.workspace,
            company_name="Client Co",
            contact_email="client@example.com",
        )


class ProjectLimitTests(UsageLimitTestCase):
    def test_unlimited_by_default_no_plan(self):
        for i in range(3):
            res = auth_client(self.owner).post(
                "/api/projects/",
                {"client": self.client_profile.id, "name": f"Project {i}"},
            )
            self.assertEqual(res.status_code, 201, res.data)

    def test_blocked_once_the_plan_limit_is_reached(self):
        plan = SubscriptionPlan.objects.create(
            name="Tiny", price_per_month=0, max_projects=1,
        )
        self.workspace.plan = plan
        self.workspace.save()
        Project.objects.create(
            workspace=self.workspace, client=self.client_profile,
            name="Existing",
        )
        res = auth_client(self.owner).post(
            "/api/projects/",
            {"client": self.client_profile.id, "name": "One too many"},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Tiny", str(res.data))


class BookingLimitTests(UsageLimitTestCase):
    def setUp(self):
        super().setUp()
        self.service = Service.objects.create(
            workspace=self.workspace, name="Consult", duration_minutes=30,
        )

    def test_blocked_once_the_monthly_plan_limit_is_reached(self):
        from portal.models import Booking
        plan = SubscriptionPlan.objects.create(
            name="Tiny", price_per_month=0, max_bookings_per_month=1,
        )
        self.workspace.plan = plan
        self.workspace.save()
        Booking.objects.create(
            workspace=self.workspace, service=self.service,
            client=self.client_profile,
            start_time="2027-06-01T10:00:00Z",
            end_time="2027-06-01T10:30:00Z",
        )
        res = auth_client(self.owner).post(
            "/api/bookings/",
            {
                "service": self.service.id,
                "client": self.client_profile.id,
                "start_time": "2027-06-02T10:00:00Z",
            },
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Tiny", str(res.data))

    def test_unlimited_by_default(self):
        res = auth_client(self.owner).post(
            "/api/bookings/",
            {
                "service": self.service.id,
                "client": self.client_profile.id,
                "start_time": "2027-06-01T10:00:00Z",
            },
        )
        self.assertEqual(res.status_code, 201, res.data)


class StorageLimitTests(UsageLimitTestCase):
    def setUp(self):
        super().setUp()
        self.project = Project.objects.create(
            workspace=self.workspace, client=self.client_profile,
            name="Project",
        )

    @override_settings(STORAGES=LOCAL_STORAGE)
    def test_blocked_when_the_upload_would_exceed_the_plan_limit(self):
        plan = SubscriptionPlan.objects.create(
            name="Tiny", price_per_month=0, max_storage_mb=0,
        )
        self.workspace.plan = plan
        self.workspace.save()
        upload = SimpleUploadedFile(
            "big.txt", b"x" * 2048, content_type="text/plain"
        )
        res = auth_client(self.owner).post(
            "/api/documents/",
            {"project": self.project.id, "file": upload},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Tiny", str(res.data))

    @override_settings(STORAGES=LOCAL_STORAGE)
    def test_allowed_under_the_plan_limit(self):
        plan = SubscriptionPlan.objects.create(
            name="Roomy", price_per_month=0, max_storage_mb=10,
        )
        self.workspace.plan = plan
        self.workspace.save()
        upload = SimpleUploadedFile(
            "small.txt", b"x" * 1024, content_type="text/plain"
        )
        res = auth_client(self.owner).post(
            "/api/documents/",
            {"project": self.project.id, "file": upload},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.data)


class WorkspaceUsageSerializerTests(UsageLimitTestCase):
    def test_exposes_project_and_booking_and_storage_usage(self):
        Project.objects.create(
            workspace=self.workspace, client=self.client_profile,
            name="A project",
        )
        res = auth_client(self.owner).get("/api/workspace/")
        self.assertEqual(res.data["project_count"], 1)
        self.assertEqual(res.data["bookings_this_month_count"], 0)
        self.assertEqual(res.data["storage_used_mb"], 0)
        self.assertEqual(res.data["usage_warnings"], [])

    def test_usage_warnings_flags_a_limit_at_80_percent(self):
        plan = SubscriptionPlan.objects.create(
            name="Small", price_per_month=0, max_projects=5,
        )
        self.workspace.plan = plan
        self.workspace.save()
        for i in range(4):  # 4 of 5 = 80%
            Project.objects.create(
                workspace=self.workspace, client=self.client_profile,
                name=f"Project {i}",
            )
        res = auth_client(self.owner).get("/api/workspace/")
        self.assertIn("projects", res.data["usage_warnings"])

    def test_no_warning_comfortably_under_the_limit(self):
        plan = SubscriptionPlan.objects.create(
            name="Small", price_per_month=0, max_projects=10,
        )
        self.workspace.plan = plan
        self.workspace.save()
        Project.objects.create(
            workspace=self.workspace, client=self.client_profile,
            name="Just one",
        )
        res = auth_client(self.owner).get("/api/workspace/")
        self.assertEqual(res.data["usage_warnings"], [])


class ChangePlanDowngradeTests(UsageLimitTestCase):
    def test_downgrade_blocked_when_over_the_new_plans_project_limit(self):
        roomy = SubscriptionPlan.objects.create(
            name="Roomy", price_per_month=29, max_projects=None,
        )
        tiny = SubscriptionPlan.objects.create(
            name="Tiny", price_per_month=0, max_projects=1,
        )
        self.workspace.plan = roomy
        self.workspace.save()
        for i in range(2):
            Project.objects.create(
                workspace=self.workspace, client=self.client_profile,
                name=f"Project {i}",
            )
        res = auth_client(self.owner).post(
            "/api/workspace/change-plan/", {"plan_id": tiny.id}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Tiny", str(res.data))

    def test_downgrade_allowed_when_within_the_new_plans_limits(self):
        roomy = SubscriptionPlan.objects.create(
            name="Roomy", price_per_month=29, max_projects=None,
        )
        tiny = SubscriptionPlan.objects.create(
            name="Tiny", price_per_month=0, max_projects=5,
        )
        self.workspace.plan = roomy
        self.workspace.save()
        res = auth_client(self.owner).post(
            "/api/workspace/change-plan/", {"plan_id": tiny.id}
        )
        self.assertEqual(res.status_code, 200, res.data)
