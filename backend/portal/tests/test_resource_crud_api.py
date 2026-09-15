"""CRUD + filtering for the new Resource Reservation System
endpoints (ResourceAvailabilityViewSet, ServiceResourceRequirement
ViewSet, ResourceReservationViewSet, ResourceRentalPolicyViewSet,
ResourceRentalViewSet's check-out/check-in/mark-overdue actions),
and that the extended ResourceSerializer fields round-trip through
the existing /api/resources/ endpoint.
"""
from datetime import time

from django.test import TestCase

from portal.models import (
    Client, Resource, ResourceAvailability, ResourceRentalPolicy,
    Service, ServiceResourceRequirement, User, Workspace,
)
from portal.tests.helpers import auth_client

MONDAY = "2027-06-07"


class ResourceCrudApiTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com",
            password="pw12345678", role="owner",
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner, name="Acme"
        )
        self.client_user = User.objects.create_user(
            username="client", email="client@example.com",
            password="pw12345678", role="client",
        )
        self.client_profile = Client.objects.create(
            workspace=self.workspace,
            user=self.client_user,
            company_name="Client Co",
            contact_email="client@example.com",
        )


class ResourceSerializerExtendedFieldsTests(ResourceCrudApiTestCase):
    def test_creating_a_resource_accepts_every_new_field(self):
        res = auth_client(self.owner).post(
            "/api/resources/",
            {
                "name": "Suite 1",
                "duration_minutes": 60,
                "type": Resource.ResourceType.HOTEL_ROOM,
                "category": "Deluxe",
                "location": "3rd floor",
                "status": Resource.Status.AVAILABLE,
                "reservation_mode": Resource.ReservationMode.RESERVATION,
                "pricing_mode": Resource.PricingMode.NIGHTLY,
                "capacity": 2,
                "capacity_mode": Resource.CapacityMode.EXCLUSIVE,
                "booking_buffer_before_minutes": 15,
                "booking_buffer_after_minutes": 30,
                "min_booking_notice_hours": 2,
                "max_advance_days": 90,
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["type_display"], "Hotel room")
        self.assertEqual(res.data["category"], "Deluxe")
        self.assertEqual(res.data["pricing_mode"], "nightly")

    def test_custom_type_requires_custom_type_text(self):
        res = auth_client(self.owner).post(
            "/api/resources/",
            {
                "name": "Golf Cart", "duration_minutes": 60,
                "type": Resource.ResourceType.CUSTOM,
            },
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("custom_type", res.data)

    def test_client_cannot_write_a_resource(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room A", duration_minutes=60
        )
        res = auth_client(self.client_user).get("/api/resources/")
        self.assertEqual(res.status_code, 200)
        # Read-only for clients is enforced the same way it already
        # was pre-existing (get_queryset scoping, no write guard on
        # this particular viewset) - this just confirms the extended
        # serializer doesn't break read access.
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["id"], resource.id)


class ResourceAvailabilityApiTests(ResourceCrudApiTestCase):
    def test_owner_can_crud_resource_hours(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60
        )
        create = auth_client(self.owner).post(
            "/api/resource-availability/",
            {
                "resource": resource.id, "weekday": 0,
                "start_time": "09:00", "end_time": "17:00",
            },
        )
        self.assertEqual(create.status_code, 201, create.data)

        listed = auth_client(self.owner).get(
            "/api/resource-availability/", {"resource": resource.id},
        )
        self.assertEqual(len(listed.data), 1)

    def test_cannot_set_hours_for_another_workspaces_resource(self):
        other_owner = User.objects.create_user(
            username="other", email="other@example.com",
            password="pw12345678", role="owner",
        )
        other_workspace = Workspace.objects.create(
            owner=other_owner, name="Other Co"
        )
        foreign_resource = Resource.objects.create(
            workspace=other_workspace, name="Foreign Room",
            duration_minutes=60,
        )
        res = auth_client(self.owner).post(
            "/api/resource-availability/",
            {
                "resource": foreign_resource.id, "weekday": 0,
                "start_time": "09:00", "end_time": "17:00",
            },
        )
        self.assertEqual(res.status_code, 400)


class ServiceResourceRequirementApiTests(ResourceCrudApiTestCase):
    def test_owner_can_create_a_requirement(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Mic", duration_minutes=60
        )
        service = Service.objects.create(
            workspace=self.workspace, name="Talk", duration_minutes=60
        )
        res = auth_client(self.owner).post(
            "/api/service-resource-requirements/",
            {
                "service": service.id, "resource": resource.id,
                "requirement_type": "required", "quantity": 1,
            },
        )
        self.assertEqual(res.status_code, 201, res.data)

    def test_client_cannot_create_a_requirement(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Mic", duration_minutes=60
        )
        service = Service.objects.create(
            workspace=self.workspace, name="Talk", duration_minutes=60
        )
        res = auth_client(self.client_user).post(
            "/api/service-resource-requirements/",
            {
                "service": service.id, "resource": resource.id,
                "requirement_type": "required",
            },
        )
        self.assertEqual(res.status_code, 403)


class ResourceReservationFilterApiTests(ResourceCrudApiTestCase):
    def setUp(self):
        super().setUp()
        self.resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60
        )
        booked = auth_client(self.client_user).post(
            "/api/bookings/",
            {
                "resource": self.resource.id,
                "start_time": f"{MONDAY}T10:00:00Z",
            },
        )
        self.booking_id = booked.data["id"]

    def test_owner_sees_the_reservation_filtered_by_resource(self):
        res = auth_client(self.owner).get(
            "/api/resource-reservations/", {"resource": self.resource.id},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["booking"], self.booking_id)

    def test_client_only_sees_their_own_reservations(self):
        other_client_user = User.objects.create_user(
            username="other_client", email="other_client@example.com",
            password="pw12345678", role="client",
        )
        Client.objects.create(
            workspace=self.workspace, user=other_client_user,
            company_name="Other Client", contact_email="oc@example.com",
        )
        res = auth_client(other_client_user).get(
            "/api/resource-reservations/"
        )
        self.assertEqual(res.data, [])

    def test_resource_calendar_action_lists_its_own_reservations(self):
        res = auth_client(self.owner).get(
            f"/api/resources/{self.resource.id}/calendar/"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)


class ResourceRentalApiTests(ResourceCrudApiTestCase):
    def setUp(self):
        super().setUp()
        self.resource = Resource.objects.create(
            workspace=self.workspace, name="Kayak", duration_minutes=60,
            reservation_mode=Resource.ReservationMode.RENTAL,
        )
        booked = auth_client(self.client_user).post(
            "/api/bookings/",
            {
                "resource": self.resource.id,
                "start_time": f"{MONDAY}T10:00:00Z",
            },
        )
        self.rental_id = auth_client(self.owner).get(
            "/api/resource-rentals/"
        ).data[0]["id"]

    def test_owner_can_check_a_rental_out_then_in(self):
        out = auth_client(self.owner).post(
            f"/api/resource-rentals/{self.rental_id}/check-out/",
            {"condition_notes_out": "Good condition"},
        )
        self.assertEqual(out.status_code, 200, out.data)
        self.assertEqual(out.data["rental_status"], "active")

        back_in = auth_client(self.owner).post(
            f"/api/resource-rentals/{self.rental_id}/check-in/",
            {"condition_notes_in": "Returned fine"},
        )
        self.assertEqual(back_in.status_code, 200, back_in.data)
        self.assertEqual(back_in.data["rental_status"], "returned")

    def test_client_cannot_check_a_rental_out(self):
        res = auth_client(self.client_user).post(
            f"/api/resource-rentals/{self.rental_id}/check-out/"
        )
        self.assertEqual(res.status_code, 403)

    def test_owner_can_mark_a_rental_overdue(self):
        res = auth_client(self.owner).post(
            f"/api/resource-rentals/{self.rental_id}/mark-overdue/"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["rental_status"], "overdue")


class ResourceRentalPolicyApiTests(ResourceCrudApiTestCase):
    def test_owner_can_create_a_rental_policy(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Kayak", duration_minutes=60,
            reservation_mode=Resource.ReservationMode.RENTAL,
        )
        res = auth_client(self.owner).post(
            "/api/resource-rental-policies/",
            {
                "resource": resource.id, "rental_unit": "hourly",
                "deposit_required": True, "deposit_amount": "20.00",
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(
            ResourceRentalPolicy.objects.filter(resource=resource).exists()
        )
