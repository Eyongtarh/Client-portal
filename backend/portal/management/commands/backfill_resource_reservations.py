"""One-off, idempotent: `python manage.py backfill_resource_reservations`.

Creates a ResourceReservation row for every existing Booking that
already reserves a resource - one per populated Booking.resource
(the legacy single-resource FK), and one per member of
service.resources.all() for every existing service booking - so
that once ResourceReservation becomes the source of truth for
availability/conflict checking, historical bookings don't silently
vanish from resource capacity counts.

Run this once, after migration 0046 and before deploying any code
that reads ResourceReservation as authoritative (the availability
engine and BookingSerializer). Safe to re-run: uses get_or_create
keyed on (booking, resource), so nothing is double-created.
"""
from django.core.management.base import BaseCommand

from portal.models import Booking, ResourceReservation


class Command(BaseCommand):
    help = (
        "Backfills ResourceReservation rows for every existing "
        "Booking that reserves a resource directly or via its "
        "service. Idempotent - safe to re-run."
    )

    def handle(self, *args, **options):
        created = 0
        skipped = 0

        direct = Booking.objects.filter(
            resource__isnull=False
        ).select_related("resource")
        for booking in direct.iterator():
            _, was_created = ResourceReservation.objects.get_or_create(
                booking=booking,
                resource=booking.resource,
                defaults={
                    "workspace_id": booking.workspace_id,
                    "requirement_type": (
                        ResourceReservation.RequirementType.REQUIRED
                    ),
                    "quantity": 1,
                },
            )
            created += was_created
            skipped += not was_created

        via_service = Booking.objects.filter(
            service__isnull=False
        ).select_related("service").prefetch_related("service__resources")
        for booking in via_service.iterator(chunk_size=200):
            for resource in booking.service.resources.all():
                _, was_created = ResourceReservation.objects.get_or_create(
                    booking=booking,
                    resource=resource,
                    defaults={
                        "workspace_id": booking.workspace_id,
                        "requirement_type": (
                            ResourceReservation.RequirementType.REQUIRED
                        ),
                        "quantity": 1,
                    },
                )
                created += was_created
                skipped += not was_created

        self.stdout.write(
            self.style.SUCCESS(
                f"Created {created} ResourceReservation row(s), "
                f"{skipped} already existed."
            )
        )
