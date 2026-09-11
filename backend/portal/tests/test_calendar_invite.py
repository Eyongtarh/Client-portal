"""Calendar invites (BOOK-61/65): booking confirmation/cancellation
emails carry a matching .ics attachment, and anyone who can already
see a booking can re-download that same invite on demand.
"""
from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from portal.calendar_invite import build_ics
from portal.models import Booking, Client, Service, User, Workspace
from portal.tests.helpers import auth_client


class CalendarInviteTestCase(TestCase):
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
        self.service = Service.objects.create(
            workspace=self.workspace, name="Haircut", duration_minutes=60,
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
        self.booking = Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.client_profile,
            start_time=timezone.now() + timedelta(days=2),
            end_time=timezone.now() + timedelta(days=2, hours=1),
        )


class BuildIcsTests(CalendarInviteTestCase):
    def test_confirmed_booking_produces_a_publish_event(self):
        ics = build_ics(self.booking)
        self.assertIn("METHOD:PUBLISH", ics)
        self.assertIn("STATUS:CONFIRMED", ics)
        self.assertIn(f"UID:booking-{self.booking.id}@clientflow", ics)
        self.assertIn("Haircut - Acme", ics)

    def test_cancelled_booking_produces_a_cancel_event_with_the_same_uid(
        self,
    ):
        ics = build_ics(self.booking, cancelled=True)
        self.assertIn("METHOD:CANCEL", ics)
        self.assertIn("STATUS:CANCELLED", ics)
        self.assertIn(f"UID:booking-{self.booking.id}@clientflow", ics)

    def test_special_characters_in_notes_are_escaped(self):
        self.booking.notes = "Bring ID, and a; note\nsecond line"
        self.booking.save(update_fields=["notes"])
        ics = build_ics(self.booking)
        self.assertIn("Bring ID\\, and a\\; note\\nsecond line", ics)


class BookingEmailAttachmentTests(CalendarInviteTestCase):
    def test_creating_a_booking_emails_an_ics_attachment(self):
        auth_client(self.client_user).post(
            "/api/bookings/",
            {
                "service": self.service.id,
                "start_time": (
                    timezone.now() + timedelta(days=3)
                ).isoformat(),
            },
        )
        self.assertEqual(len(mail.outbox), 1)
        attachments = mail.outbox[0].attachments
        self.assertEqual(len(attachments), 1)
        filename, content, mimetype = attachments[0]
        self.assertEqual(filename, "booking.ics")
        self.assertEqual(mimetype, "text/calendar")
        self.assertIn("METHOD:PUBLISH", content)

    def test_cancelling_a_booking_emails_a_cancel_ics_attachment(self):
        auth_client(self.client_user).patch(
            f"/api/bookings/{self.booking.id}/", {"status": "cancelled"},
        )
        self.assertEqual(len(mail.outbox), 1)
        filename, content, mimetype = mail.outbox[0].attachments[0]
        self.assertEqual(filename, "booking.ics")
        self.assertIn("METHOD:CANCEL", content)


class BookingICSViewTests(CalendarInviteTestCase):
    def test_the_client_can_download_their_own_bookings_invite(self):
        res = auth_client(self.client_user).get(
            f"/api/bookings/{self.booking.id}/ics/"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "text/calendar")
        self.assertIn(b"METHOD:PUBLISH", res.content)

    def test_the_owner_can_download_any_workspace_bookings_invite(self):
        res = auth_client(self.owner).get(
            f"/api/bookings/{self.booking.id}/ics/"
        )
        self.assertEqual(res.status_code, 200)

    def test_another_clients_booking_is_not_downloadable(self):
        other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="pw12345678",
            role="client",
        )
        Client.objects.create(
            workspace=self.workspace,
            user=other_user,
            company_name="Other Co",
            contact_email="other@example.com",
        )
        res = auth_client(other_user).get(
            f"/api/bookings/{self.booking.id}/ics/"
        )
        self.assertEqual(res.status_code, 404)
