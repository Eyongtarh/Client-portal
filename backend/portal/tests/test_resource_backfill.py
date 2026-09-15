"""backfill_resource_reservations must turn every existing Booking
that reserves a resource (directly or via its service) into a
ResourceReservation row, and be safe to run more than once - the
Resource Reservation System plan requires this to run once in
production between the schema migration and the availability engine
that starts reading ResourceReservation as authoritative.
"""
from django.core.management import call_command
from django.test import TestCase

from portal.models import (
    Booking, Client, Resource, ResourceReservation, Service, User,
    Workspace,
)


class BackfillResourceReservationsTests(TestCase):
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

    def test_backfills_a_direct_resource_booking(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60
        )
        booking = Booking.objects.create(
            workspace=self.workspace,
            resource=resource,
            client=self.client_profile,
            start_time="2027-06-07T10:00:00Z",
            end_time="2027-06-07T11:00:00Z",
        )
        call_command("backfill_resource_reservations")
        self.assertTrue(
            ResourceReservation.objects.filter(
                booking=booking, resource=resource
            ).exists()
        )

    def test_backfills_every_resource_a_service_booking_uses(self):
        mic = Resource.objects.create(
            workspace=self.workspace, name="Mic", duration_minutes=60
        )
        light = Resource.objects.create(
            workspace=self.workspace, name="Light", duration_minutes=60
        )
        service = Service.objects.create(
            workspace=self.workspace, name="Talk", duration_minutes=60
        )
        service.resources.set([mic, light])
        booking = Booking.objects.create(
            workspace=self.workspace,
            service=service,
            client=self.client_profile,
            start_time="2027-06-07T10:00:00Z",
            end_time="2027-06-07T11:00:00Z",
        )
        call_command("backfill_resource_reservations")
        self.assertEqual(
            set(
                ResourceReservation.objects.filter(
                    booking=booking
                ).values_list("resource_id", flat=True)
            ),
            {mic.id, light.id},
        )

    def test_running_it_twice_creates_nothing_new(self):
        resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60
        )
        Booking.objects.create(
            workspace=self.workspace,
            resource=resource,
            client=self.client_profile,
            start_time="2027-06-07T10:00:00Z",
            end_time="2027-06-07T11:00:00Z",
        )
        call_command("backfill_resource_reservations")
        first_count = ResourceReservation.objects.count()
        call_command("backfill_resource_reservations")
        self.assertEqual(ResourceReservation.objects.count(), first_count)
