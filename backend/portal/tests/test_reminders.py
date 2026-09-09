"""send_booking_reminders (BOOK-58/59): the two things that matter
are that it only reminds bookings actually inside the configured
window (not everything upcoming) and that it never reminds the same
booking twice.
"""
from io import StringIO

from django.core import mail
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from portal.models import Booking, Client, Service, User, Workspace


class SendBookingRemindersTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="pw12345678",
            role="owner",
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner, name="Acme", reminder_hours_before=24
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
        self.service = Service.objects.create(
            workspace=self.workspace, name="Consult", duration_minutes=60
        )

    def _booking(self, start_delta):
        start = timezone.now() + start_delta
        return Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            start_time=start,
            end_time=start + timezone.timedelta(hours=1),
        )

    def test_reminds_booking_inside_window(self):
        booking = self._booking(timezone.timedelta(hours=5))
        call_command("send_booking_reminders", stdout=StringIO())
        booking.refresh_from_db()
        self.assertIsNotNone(booking.reminder_sent_at)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("client@example.com", mail.outbox[0].to)

    def test_does_not_remind_booking_outside_window(self):
        booking = self._booking(timezone.timedelta(days=5))
        call_command("send_booking_reminders", stdout=StringIO())
        booking.refresh_from_db()
        self.assertIsNone(booking.reminder_sent_at)
        self.assertEqual(len(mail.outbox), 0)

    def test_never_reminds_the_same_booking_twice(self):
        booking = self._booking(timezone.timedelta(hours=5))
        call_command("send_booking_reminders", stdout=StringIO())
        call_command("send_booking_reminders", stdout=StringIO())
        self.assertEqual(len(mail.outbox), 1)

    def test_does_not_remind_cancelled_bookings(self):
        booking = self._booking(timezone.timedelta(hours=5))
        booking.status = "cancelled"
        booking.save()
        call_command("send_booking_reminders", stdout=StringIO())
        self.assertEqual(len(mail.outbox), 0)

    def test_respects_per_workspace_reminder_window(self):
        self.workspace.reminder_hours_before = 2
        self.workspace.save()
        booking = self._booking(timezone.timedelta(hours=5))
        call_command("send_booking_reminders", stdout=StringIO())
        booking.refresh_from_db()
        self.assertIsNone(booking.reminder_sent_at)
