"""Run periodically (hourly is plenty) via cron / Heroku Scheduler:
`python manage.py send_booking_reminders`. There's no Celery/queue
in this project, so a scheduled management command is the simplest
correct way to get BOOK-58/59 (appointment reminders, configurable
per workspace) without adding new infrastructure.
"""
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.utils import timezone

from portal.models import Booking


class Command(BaseCommand):
    help = (
        "Emails a reminder for every confirmed booking that has "
        "entered its workspace's reminder window and hasn't been "
        "reminded yet."
    )

    def handle(self, *args, **options):
        now = timezone.now()
        sent = 0
        bookings = Booking.objects.filter(
            status="confirmed",
            reminder_sent_at__isnull=True,
            start_time__gt=now,
        ).select_related("workspace", "client", "service", "resource")
        for booking in bookings:
            window = timedelta(hours=booking.workspace.reminder_hours_before)
            if now < booking.start_time - window:
                continue
            booked_name = (
                booking.service.name
                if booking.service
                else booking.resource.name
            )
            send_mail(
                subject=(
                    f"Reminder: {booked_name} on "
                    f"{booking.start_time.strftime('%A %d %B')}"
                ),
                message=(
                    "This is a reminder for your upcoming booking:\n\n"
                    f"{booked_name}\n"
                    f"{booking.start_time.strftime('%A %d %B %Y at %H:%M')}"
                    "\n\nIf you need to cancel or reschedule, do so from "
                    "your client portal."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[booking.client.contact_email],
                fail_silently=True,
            )
            booking.reminder_sent_at = now
            booking.save(update_fields=["reminder_sent_at"])
            sent += 1
        self.stdout.write(
            self.style.SUCCESS(f"Sent {sent} booking reminder(s).")
        )
