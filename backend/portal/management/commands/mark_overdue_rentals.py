"""Run periodically (hourly is plenty, same cadence as
send_booking_reminders) via cron / Heroku Scheduler:
`python manage.py mark_overdue_rentals`. Flips a RENTAL-mode
resource's ResourceRental from ACTIVE to OVERDUE once its booking's
end_time has passed with no check-in recorded yet (BOOK-103).
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from portal.models import ResourceRental


class Command(BaseCommand):
    help = (
        "Marks OVERDUE every ACTIVE resource rental whose booking "
        "has ended with no check-in recorded."
    )

    def handle(self, *args, **options):
        updated = ResourceRental.objects.filter(
            rental_status=ResourceRental.RentalStatus.ACTIVE,
            checked_in_at__isnull=True,
            booking__end_time__lt=timezone.now(),
        ).update(rental_status=ResourceRental.RentalStatus.OVERDUE)
        self.stdout.write(
            self.style.SUCCESS(f"Marked {updated} rental(s) overdue.")
        )
