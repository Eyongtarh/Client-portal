"""Team member assignment (TEAM-04, TEAM-05). Staff still see the
whole workspace by default everywhere in this API - assignment adds
an opt-in ?assigned_to_me=true filter on top of that, it never
narrows what staff can see by default. Projects and bookings have no
assignment of their own for clients: a project inherits its client's
assignment, since every project already hangs off exactly one
client; a booking gets its own `staff` field instead, since one
appointment can reasonably be handled by someone other than whoever
manages the client relationship overall.
"""
from django.test import TestCase

from portal.models import (
    Booking, Client, Project, Service, User, Workspace,
)
from portal.tests.helpers import auth_client


class TeamAssignmentTestCase(TestCase):
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
        self.staff_a = User.objects.create_user(
            username="staffa",
            email="staffa@example.com",
            password="pw12345678",
            role="staff",
            staff_workspace=self.workspace,
        )
        self.staff_b = User.objects.create_user(
            username="staffb",
            email="staffb@example.com",
            password="pw12345678",
            role="staff",
            staff_workspace=self.workspace,
        )
        self.client_user = User.objects.create_user(
            username="client",
            email="client@example.com",
            password="pw12345678",
            role="client",
        )
        self.assigned_client = Client.objects.create(
            workspace=self.workspace,
            user=self.client_user,
            company_name="Assigned Co",
            contact_email="client@example.com",
        )
        self.assigned_client.assigned_staff.add(self.staff_a)
        self.unassigned_client = Client.objects.create(
            workspace=self.workspace,
            company_name="Unassigned Co",
            contact_email="other@example.com",
        )


class ClientAssignmentTests(TeamAssignmentTestCase):
    def test_staff_sees_all_clients_by_default(self):
        res = auth_client(self.staff_a).get("/api/clients/")
        names = [c["company_name"] for c in res.data]
        self.assertIn("Assigned Co", names)
        self.assertIn("Unassigned Co", names)

    def test_assigned_to_me_narrows_to_only_that_staff_members_clients(self):
        res = auth_client(self.staff_a).get(
            "/api/clients/?assigned_to_me=true"
        )
        self.assertEqual(
            [c["company_name"] for c in res.data], ["Assigned Co"]
        )

    def test_a_different_staff_member_sees_nothing_assigned_to_them(self):
        res = auth_client(self.staff_b).get(
            "/api/clients/?assigned_to_me=true"
        )
        self.assertEqual(res.data, [])

    def test_owner_can_assign_staff_to_a_client(self):
        res = auth_client(self.owner).patch(
            f"/api/clients/{self.unassigned_client.id}/",
            {"assigned_staff": [self.staff_b.id]},
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.unassigned_client.refresh_from_db()
        self.assertEqual(
            list(self.unassigned_client.assigned_staff.all()), [self.staff_b]
        )

    def test_cannot_assign_a_staff_member_from_another_workspace(self):
        other_owner = User.objects.create_user(
            username="otherowner",
            email="otherowner@example.com",
            password="pw12345678",
            role="owner",
        )
        other_ws = Workspace.objects.create(owner=other_owner, name="Other")
        outside_staff = User.objects.create_user(
            username="outsidestaff",
            email="outsidestaff@example.com",
            password="pw12345678",
            role="staff",
            staff_workspace=other_ws,
        )
        res = auth_client(self.owner).patch(
            f"/api/clients/{self.unassigned_client.id}/",
            {"assigned_staff": [outside_staff.id]},
        )
        self.assertEqual(res.status_code, 400)


class ProjectAssignmentTests(TeamAssignmentTestCase):
    def setUp(self):
        super().setUp()
        self.assigned_project = Project.objects.create(
            workspace=self.workspace,
            client=self.assigned_client,
            name="Assigned project",
        )
        Project.objects.create(
            workspace=self.workspace,
            client=self.unassigned_client,
            name="Unassigned project",
        )

    def test_assigned_to_me_narrows_projects_via_their_clients_assignment(self):
        res = auth_client(self.staff_a).get(
            "/api/projects/?assigned_to_me=true"
        )
        self.assertEqual(
            [p["name"] for p in res.data], ["Assigned project"]
        )

    def test_staff_still_sees_all_projects_by_default(self):
        res = auth_client(self.staff_a).get("/api/projects/")
        self.assertEqual(len(res.data), 2)


class ServiceStaffAssignmentTests(TeamAssignmentTestCase):
    def test_owner_can_assign_staff_to_a_service(self):
        res = auth_client(self.owner).post(
            "/api/services/",
            {
                "name": "Haircut",
                "duration_minutes": 30,
                "staff": [self.staff_a.id, self.staff_b.id],
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        service = Service.objects.get(id=res.data["id"])
        self.assertEqual(
            set(service.staff.all()), {self.staff_a, self.staff_b}
        )
        self.assertEqual(
            set(res.data["staff_names"]),
            {self.staff_a.first_name, self.staff_b.first_name},
        )


class BookingStaffAssignmentTests(TeamAssignmentTestCase):
    def setUp(self):
        super().setUp()
        self.service = Service.objects.create(
            workspace=self.workspace, name="Haircut", duration_minutes=30,
        )

    def test_owner_can_assign_a_booking_to_a_staff_member(self):
        res = auth_client(self.owner).post(
            "/api/bookings/",
            {
                "service": self.service.id,
                "client": self.assigned_client.id,
                "staff": self.staff_a.id,
                "start_time": "2027-06-01T10:00:00Z",
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["staff"], self.staff_a.id)
        self.assertEqual(res.data["staff_name"], self.staff_a.first_name)

    def test_cannot_assign_a_staff_member_from_another_workspace_to_a_booking(
        self,
    ):
        other_owner = User.objects.create_user(
            username="otherowner2",
            email="otherowner2@example.com",
            password="pw12345678",
            role="owner",
        )
        other_ws = Workspace.objects.create(owner=other_owner, name="Other2")
        outside_staff = User.objects.create_user(
            username="outsidestaff2",
            email="outsidestaff2@example.com",
            password="pw12345678",
            role="staff",
            staff_workspace=other_ws,
        )
        res = auth_client(self.owner).post(
            "/api/bookings/",
            {
                "service": self.service.id,
                "client": self.assigned_client.id,
                "staff": outside_staff.id,
                "start_time": "2027-06-01T10:00:00Z",
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_client_cannot_assign_staff_to_their_own_booking(self):
        res = auth_client(self.client_user).post(
            "/api/bookings/",
            {
                "service": self.service.id,
                "staff": self.staff_a.id,
                "start_time": "2027-06-01T10:00:00Z",
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_assigned_to_me_narrows_bookings_to_that_staff_members_bookings(
        self,
    ):
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.assigned_client,
            staff=self.staff_a,
            start_time="2027-06-01T10:00:00Z",
            end_time="2027-06-01T10:30:00Z",
        )
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.unassigned_client,
            staff=self.staff_b,
            start_time="2027-06-02T10:00:00Z",
            end_time="2027-06-02T10:30:00Z",
        )
        res = auth_client(self.staff_a).get(
            "/api/bookings/?assigned_to_me=true"
        )
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["staff"], self.staff_a.id)

    def test_filters_bookings_by_staff_query_param(self):
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.assigned_client,
            staff=self.staff_a,
            start_time="2027-06-01T10:00:00Z",
            end_time="2027-06-01T10:30:00Z",
        )
        Booking.objects.create(
            workspace=self.workspace,
            service=self.service,
            client=self.unassigned_client,
            staff=self.staff_b,
            start_time="2027-06-02T10:00:00Z",
            end_time="2027-06-02T10:30:00Z",
        )
        res = auth_client(self.owner).get(
            f"/api/bookings/?staff={self.staff_b.id}"
        )
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["staff"], self.staff_b.id)
