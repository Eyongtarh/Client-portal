"""BOOK-107: concurrent booking attempts for the same resource must
be handled safely - a plain TestCase wraps each test in one outer
transaction, which never lets two threads' writes actually run
concurrently against the database, so this needs TransactionTestCase
instead (see the Resource Reservation System plan's Verification
section).

This asserts on the database's final state (exactly one confirmed
reservation survives, never two), not on which thread's HTTP response
says 201 - on SQLite, a request that already committed its booking
inside BookingSerializer.create()'s transaction.atomic() block can
still surface an unrelated "database is locked" error moments later,
from an ordinary, non-atomic write done after that - e.g.
BookingViewSet.perform_create()'s activity-log entry - purely because
a second thread is contending for the same file at that moment. Such
a request has already succeeded in every way that matters (the row
exists, committed) even though its HTTP response reports failure and
a naive test would retry it, firing a second, correctly-rejected
attempt that overwrites the true outcome. None of that is particular
to this test; it's a general SQLite-testing hazard whenever a write
happens outside the atomic block whose success is being asserted on -
asserting on final row counts sidesteps it entirely, and is besides
the more direct expression of the actual property BOOK-107 cares
about (no double booking), independent of which HTTP call happens to
report it.

Real per-row locking (select_for_update) only exists at the database
level on Postgres - SQLite has none, so two threads' capacity checks
can both read "room available" before either commits. What actually
prevents a double-booking here is SQLite's own file-level write lock:
whichever thread's first write statement (inside the transaction)
gets there first wins the commit race, and the loser's local decision
(made from now-stale data) either fails outright or - if it also
manages to commit - would show up as a second reservation, which is
exactly what the row-count assertion below would catch. The retry
loop exists only so a transient "database is locked" on the initial
attempt doesn't fail the test spuriously; it is not what makes the
outcome correct.
"""
import threading
import time as time_module

from django.db.utils import OperationalError
from django.test import TransactionTestCase

from portal.models import (
    Booking, Client, Resource, ResourceReservation, User, Workspace,
)
from portal.tests.helpers import auth_client

MONDAY = "2027-06-07"


class ResourceConcurrencyTests(TransactionTestCase):
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
        Client.objects.create(
            workspace=self.workspace,
            user=self.client_user,
            company_name="Client Co",
            contact_email="client@example.com",
        )
        self.resource = Resource.objects.create(
            workspace=self.workspace, name="Room", duration_minutes=60,
            quantity=1,
        )

    def test_only_one_of_two_concurrent_bookings_is_ever_confirmed(self):
        outcomes = []
        lock = threading.Lock()
        # Built sequentially, before the threads start: getting a JWT
        # is itself a DB write (OutstandingToken), so building it
        # concurrently on SQLite could hit "database is locked" too -
        # that's not part of what this test is exercising (the
        # booking-conflict path), so it must never be timed against
        # the other thread the way the POST calls below are.
        apis = [auth_client(self.client_user) for _ in range(2)]

        def attempt(api):
            deadline = time_module.monotonic() + 5
            outcome = None
            while time_module.monotonic() < deadline:
                try:
                    res = api.post(
                        "/api/bookings/",
                        {
                            "resource": self.resource.id,
                            "start_time": f"{MONDAY}T10:00:00Z",
                        },
                    )
                    outcome = res.status_code
                    break
                except OperationalError as exc:
                    if "locked" not in str(exc):
                        raise
                    time_module.sleep(0.02)
            with lock:
                outcomes.append(outcome)

        threads = [threading.Thread(target=attempt, args=(api,)) for api in apis]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        reservation_count = ResourceReservation.objects.filter(
            resource=self.resource
        ).count()
        confirmed_count = Booking.objects.filter(
            resource_reservations__resource=self.resource,
            status="confirmed",
        ).count()
        self.assertEqual(
            reservation_count, 1,
            f"expected exactly one reservation to survive, got "
            f"{reservation_count} (HTTP outcomes were {outcomes})",
        )
        self.assertEqual(
            confirmed_count, 1,
            f"expected exactly one confirmed booking, got "
            f"{confirmed_count} (HTTP outcomes were {outcomes})",
        )
