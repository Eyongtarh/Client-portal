"""BOOK-107: concurrent booking attempts for the same resource must
be handled safely - a plain TestCase wraps each test in one outer
transaction, which never lets two threads' writes actually run
concurrently against the database, so this needs TransactionTestCase
instead (see the Resource Reservation System plan's Verification
section). Real per-row locking (select_for_update) only exists at
the database level on Postgres - SQLite (what this test suite runs
against) has no row-level locking and, with two threads opening
separate connections to the same file, no built-in wait/retry either
(a second writer gets `database is locked` immediately rather than
blocking). This test's retry loop stands in for that database-level
wait: on Postgres, the second request's `Resource.objects.
select_for_update()` call itself blocks until the first transaction
commits, then its recheck correctly rejects it - the retry here
exists only to work around SQLite's lack of a busy-wait, not to
paper over a bug in the locking design itself (BookingSerializer.
create()'s transaction.atomic() + select_for_update()).
"""
import threading
import time as time_module

from django.db.utils import OperationalError
from django.test import TransactionTestCase

from portal.models import (
    Client, Resource, ResourceReservation, User, Workspace,
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

    def test_only_one_of_two_concurrent_bookings_succeeds(self):
        outcomes = []
        lock = threading.Lock()

        def attempt():
            api = auth_client(self.client_user)
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

        threads = [threading.Thread(target=attempt) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(
            outcomes.count(201), 1,
            f"expected exactly one booking to succeed, got {outcomes}",
        )
        self.assertEqual(
            ResourceReservation.objects.filter(
                resource=self.resource
            ).count(),
            1,
        )
