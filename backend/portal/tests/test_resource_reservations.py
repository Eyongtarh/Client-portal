"""Resource Reservation System (BOOK-51..108): resource-specific
availability windows, blocking, capacity modes, service resource
requirements, and the payment-wiring gap the plan closes (a priced
resource used to be silently always free). Concurrency (BOOK-107)
is covered separately in test_resource_reservation_concurrency.py,
since it needs TransactionTestCase instead of TestCase.
"""
from datetime import time

from django.test import TestCase

from portal.models import (
    BlockedTime, Booking, Client, Resource, ResourceAvailability,
    ResourceReservation, Service, ServiceResourceRequirement, User,
    Workspace,
)
from portal.tests.helpers import auth_client

MONDAY = "2027-06-07"  # matches test_booking_rules.py - a Monday, safely future


class ResourceReservationTestCase(TestCase):
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

    def _book_resource(self, resource, start=f"{MONDAY}T10:00:00Z"):
        return auth_client(self.client_user).post(
            "/api/bookings/",
            {"resource": resource.id, "start_time": start},
        )


class DirectResourceBookingTests(ResourceReservationTestCase):
    def test_booking_a_resource_creates_a_reservation_row(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room A", duration_minutes=60
        )
        res = self._book_resource(resource)
        self.assertEqual(res.status_code, 201, res.data)
        booking = Booking.objects.get(pk=res.data["id"])
        self.assertEqual(
            list(
                booking.resource_reservations.values_list(
                    "resource_id", flat=True
                )
            ),
            [resource.id],
        )
        # A single reserved resource still populates the legacy FK,
        # for old code (__str__, exports) that reads it directly.
        self.assertEqual(booking.resource_id, resource.id)

    def test_quantity_one_resource_rejects_a_second_overlapping_booking(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room A", duration_minutes=60,
            quantity=1,
        )
        first = self._book_resource(resource)
        self.assertEqual(first.status_code, 201, first.data)
        second = self._book_resource(resource)
        self.assertEqual(second.status_code, 400)

    def test_a_blocked_resource_status_cannot_be_booked(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room A", duration_minutes=60,
            status=Resource.Status.MAINTENANCE,
        )
        res = self._book_resource(resource)
        self.assertEqual(res.status_code, 400)

    def test_booking_only_resource_rejects_direct_booking(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room A", duration_minutes=60,
            reservation_mode=Resource.ReservationMode.BOOKING,
        )
        res = self._book_resource(resource)
        self.assertEqual(res.status_code, 400)

    def test_cancelling_a_resource_booking_frees_it_but_keeps_history(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room A", duration_minutes=60,
            quantity=1,
        )
        first = self._book_resource(resource)
        booking_id = first.data["id"]
        cancel = auth_client(self.client_user).patch(
            f"/api/bookings/{booking_id}/", {"status": "cancelled"},
        )
        self.assertEqual(cancel.status_code, 200, cancel.data)

        second = self._book_resource(resource)
        self.assertEqual(second.status_code, 201, second.data)
        # BOOK-102/108: the cancelled booking's reservation stays in
        # the table for history/audit rather than being deleted.
        self.assertTrue(
            ResourceReservation.objects.filter(booking_id=booking_id).exists()
        )

    def test_a_priced_resource_sets_pending_payment_on_the_booking(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Studio", duration_minutes=60,
            price="50.00", pricing_mode=Resource.PricingMode.PER_USE,
        )
        res = self._book_resource(resource)
        self.assertEqual(res.status_code, 201, res.data)
        booking = Booking.objects.get(pk=res.data["id"])
        self.assertEqual(str(booking.payment_amount), "50.00")
        self.assertEqual(booking.payment_status, "pending")

    def test_an_unpriced_resource_never_requires_payment(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room A", duration_minutes=60,
        )
        res = self._book_resource(resource)
        booking = Booking.objects.get(pk=res.data["id"])
        self.assertIsNone(booking.payment_amount)
        self.assertEqual(booking.payment_status, "not_required")


class MultiResourceBookingTests(ResourceReservationTestCase):
    def test_booking_multiple_resources_at_once(self):
        chair = Resource.objects.create(
            workspace=self.workspace, name="Chair", duration_minutes=60
        )
        table = Resource.objects.create(
            workspace=self.workspace, name="Table", duration_minutes=60
        )
        res = auth_client(self.client_user).post(
            "/api/bookings/",
            {
                "resource_ids": [chair.id, table.id],
                "start_time": f"{MONDAY}T10:00:00Z",
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        booking = Booking.objects.get(pk=res.data["id"])
        self.assertEqual(booking.resource_reservations.count(), 2)
        # More than one reserved resource leaves the legacy singular
        # FK null - there's no single resource to point it at.
        self.assertIsNone(booking.resource)

    def test_resource_ids_from_another_workspace_is_rejected(self):
        other_owner = User.objects.create_user(
            username="other", email="other@example.com",
            password="pw12345678", role="owner",
        )
        other_workspace = Workspace.objects.create(
            owner=other_owner, name="Other Co"
        )
        foreign = Resource.objects.create(
            workspace=other_workspace, name="Foreign Room",
            duration_minutes=60,
        )
        res = auth_client(self.client_user).post(
            "/api/bookings/",
            {
                "resource_ids": [foreign.id],
                "start_time": f"{MONDAY}T10:00:00Z",
            },
        )
        self.assertEqual(res.status_code, 400)


class CapacityModeTests(ResourceReservationTestCase):
    def test_shared_capacity_allows_multiple_bookings_up_to_the_limit(self):
        room = Resource.objects.create(
            workspace=self.workspace, name="Meeting Room",
            duration_minutes=60,
            capacity_mode=Resource.CapacityMode.SHARED, capacity=2,
        )
        first = self._book_resource(room)
        second = self._book_resource(room)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)

        third = self._book_resource(room)
        self.assertEqual(third.status_code, 400)


class ServiceResourceRequirementTests(ResourceReservationTestCase):
    def test_required_resource_blocks_a_second_service_booking_when_full(self):
        projector = Resource.objects.create(
            workspace=self.workspace, name="Projector", duration_minutes=60,
            quantity=1,
        )
        service_a = Service.objects.create(
            workspace=self.workspace, name="Workshop A", duration_minutes=60,
        )
        service_b = Service.objects.create(
            workspace=self.workspace, name="Workshop B", duration_minutes=60,
        )
        for service in (service_a, service_b):
            ServiceResourceRequirement.objects.create(
                service=service, resource=projector,
                requirement_type=(
                    ServiceResourceRequirement.RequirementType.REQUIRED
                ),
            )

        first = auth_client(self.client_user).post(
            "/api/bookings/",
            {"service": service_a.id, "start_time": f"{MONDAY}T10:00:00Z"},
        )
        self.assertEqual(first.status_code, 201, first.data)

        second = auth_client(self.client_user).post(
            "/api/bookings/",
            {"service": service_b.id, "start_time": f"{MONDAY}T10:00:00Z"},
        )
        self.assertEqual(second.status_code, 400)

    def test_alternative_group_picks_an_available_member(self):
        room_a = Resource.objects.create(
            workspace=self.workspace, name="Room A", duration_minutes=60,
            quantity=1,
        )
        room_b = Resource.objects.create(
            workspace=self.workspace, name="Room B", duration_minutes=60,
            quantity=1,
        )
        service = Service.objects.create(
            workspace=self.workspace, name="Consult", duration_minutes=60,
        )
        for room in (room_a, room_b):
            ServiceResourceRequirement.objects.create(
                service=service, resource=room,
                requirement_type=(
                    ServiceResourceRequirement.RequirementType.ALTERNATIVE
                ),
                alternative_group="room",
            )

        self._book_resource(room_a)  # fills room_a directly

        res = auth_client(self.client_user).post(
            "/api/bookings/",
            {"service": service.id, "start_time": f"{MONDAY}T10:00:00Z"},
        )
        self.assertEqual(res.status_code, 201, res.data)
        booking = Booking.objects.get(pk=res.data["id"])
        self.assertEqual(
            list(
                booking.resource_reservations.values_list(
                    "resource_id", flat=True
                )
            ),
            [room_b.id],
        )

    def test_alternative_group_fails_when_every_member_is_full(self):
        room_a = Resource.objects.create(
            workspace=self.workspace, name="Room A", duration_minutes=60,
            quantity=1,
        )
        room_b = Resource.objects.create(
            workspace=self.workspace, name="Room B", duration_minutes=60,
            quantity=1,
        )
        service = Service.objects.create(
            workspace=self.workspace, name="Consult", duration_minutes=60,
        )
        for room in (room_a, room_b):
            ServiceResourceRequirement.objects.create(
                service=service, resource=room,
                requirement_type=(
                    ServiceResourceRequirement.RequirementType.ALTERNATIVE
                ),
                alternative_group="room",
            )
        self._book_resource(room_a)
        self._book_resource(room_b)

        res = auth_client(self.client_user).post(
            "/api/bookings/",
            {"service": service.id, "start_time": f"{MONDAY}T10:00:00Z"},
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Booking.objects.filter(service=service).count(), 0)

    def test_optional_resource_without_room_never_blocks_the_booking(self):
        extra_mic = Resource.objects.create(
            workspace=self.workspace, name="Extra Mic", duration_minutes=60,
            quantity=1,
        )
        service = Service.objects.create(
            workspace=self.workspace, name="Talk", duration_minutes=60,
        )
        ServiceResourceRequirement.objects.create(
            service=service, resource=extra_mic,
            requirement_type=(
                ServiceResourceRequirement.RequirementType.OPTIONAL
            ),
        )
        self._book_resource(extra_mic)

        res = auth_client(self.client_user).post(
            "/api/bookings/",
            {"service": service.id, "start_time": f"{MONDAY}T10:00:00Z"},
        )
        self.assertEqual(res.status_code, 201, res.data)
        booking = Booking.objects.get(pk=res.data["id"])
        self.assertEqual(booking.resource_reservations.count(), 0)

    def test_no_requirement_rows_falls_back_to_the_legacy_m2m(self):
        """A service that predates ServiceResourceRequirement keeps
        working through its plain `resources` M2M, unmodified."""
        mic = Resource.objects.create(
            workspace=self.workspace, name="Mic", duration_minutes=60,
            quantity=1,
        )
        service = Service.objects.create(
            workspace=self.workspace, name="Talk", duration_minutes=60,
        )
        service.resources.add(mic)
        self._book_resource(mic)

        res = auth_client(self.client_user).post(
            "/api/bookings/",
            {"service": service.id, "start_time": f"{MONDAY}T10:00:00Z"},
        )
        self.assertEqual(res.status_code, 400)


class ResourceRentalWiringTests(ResourceReservationTestCase):
    def test_a_rental_mode_resource_creates_a_resource_rental_row(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Kayak", duration_minutes=60,
            reservation_mode=Resource.ReservationMode.RENTAL,
        )
        res = self._book_resource(resource)
        self.assertEqual(res.status_code, 201, res.data)
        booking = Booking.objects.get(pk=res.data["id"])
        reservation = booking.resource_reservations.get()
        self.assertTrue(hasattr(reservation, "rental"))
        self.assertEqual(reservation.rental.rental_status, "scheduled")


class ResourceAvailabilityWindowTests(ResourceReservationTestCase):
    def test_unconfigured_resource_is_bookable_across_the_full_day(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=120
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"resource": resource.id, "date": MONDAY},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("00:00", res.data["slots"])
        self.assertIn("22:00", res.data["slots"])

    def test_configured_hours_restrict_slots_to_the_window(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60
        )
        ResourceAvailability.objects.create(
            workspace=self.workspace, resource=resource, weekday=0,
            start_time=time(9, 0), end_time=time(12, 0),
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"resource": resource.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], ["09:00", "10:00", "11:00"])

    def test_a_resource_specific_block_removes_its_own_window(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60
        )
        ResourceAvailability.objects.create(
            workspace=self.workspace, resource=resource, weekday=0,
            start_time=time(9, 0), end_time=time(12, 0),
        )
        BlockedTime.objects.create(
            workspace=self.workspace, resource=resource,
            start_time=f"{MONDAY}T10:00:00Z", end_time=f"{MONDAY}T11:00:00Z",
            reason="Maintenance",
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"resource": resource.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], ["09:00", "11:00"])

    def test_a_staff_specific_block_never_affects_a_resource(self):
        """A BlockedTime with `staff` set (and no `resource`) is a
        personal block for that team member - it must never bleed
        into a resource's own availability."""
        staff = User.objects.create_user(
            username="staffer", email="staffer@example.com",
            password="pw12345678", role="staff", staff_workspace=self.workspace,
        )
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60
        )
        BlockedTime.objects.create(
            workspace=self.workspace, staff=staff,
            start_time=f"{MONDAY}T10:00:00Z", end_time=f"{MONDAY}T11:00:00Z",
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"resource": resource.id, "date": MONDAY},
        )
        self.assertIn("10:00", res.data["slots"])

    def test_unbookable_status_returns_no_slots(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60,
            status=Resource.Status.RETIRED,
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"resource": resource.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], [])

    def test_booking_only_resource_returns_no_slots_directly(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60,
            reservation_mode=Resource.ReservationMode.BOOKING,
        )
        res = auth_client(self.owner).get(
            "/api/availability/", {"resource": resource.id, "date": MONDAY},
        )
        self.assertEqual(res.data["slots"], [])
