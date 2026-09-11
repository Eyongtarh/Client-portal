"""Custom booking intake questions (BOOK-69/70/71): an owner attaches
questions to a service, a client (or guest) answers them while
booking, and the answers land on the booking itself for the owner to
review before the appointment.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from portal.models import Client, Service, ServiceQuestion, User, Workspace
from portal.tests.helpers import auth_client

MONDAY = "2027-06-07"  # a Monday, safely in the future


class IntakeQuestionTestCase(TestCase):
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


class ServiceQuestionManagementTests(IntakeQuestionTestCase):
    def test_owner_can_create_a_question(self):
        res = auth_client(self.owner).post(
            "/api/service-questions/",
            {
                "service": self.service.id,
                "text": "What's your hair type?",
                "question_type": "text",
            },
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["workspace"], self.workspace.id)

    def test_choice_question_requires_choices(self):
        res = auth_client(self.owner).post(
            "/api/service-questions/",
            {
                "service": self.service.id,
                "text": "Preferred style?",
                "question_type": "choice",
                "choices": "",
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_cannot_attach_a_question_to_another_workspaces_service(self):
        other_owner = User.objects.create_user(
            username="other", email="other@example.com",
            password="pw12345678", role="owner",
        )
        other_workspace = Workspace.objects.create(
            owner=other_owner, name="Other"
        )
        other_service = Service.objects.create(
            workspace=other_workspace, name="Massage", duration_minutes=60,
        )
        res = auth_client(self.owner).post(
            "/api/service-questions/",
            {
                "service": other_service.id,
                "text": "Anything?",
                "question_type": "text",
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_service_listing_includes_its_questions(self):
        ServiceQuestion.objects.create(
            workspace=self.workspace,
            service=self.service,
            text="Allergies?",
            question_type="text",
        )
        res = auth_client(self.client_user).get("/api/services/")
        questions = res.data[0]["questions"]
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["text"], "Allergies?")


class BookingAnswerValidationTests(IntakeQuestionTestCase):
    def _book(self, custom_answers=None):
        payload = {
            "service": self.service.id,
            "start_time": f"{MONDAY}T09:00:00Z",
        }
        if custom_answers is not None:
            payload["custom_answers"] = custom_answers
        return auth_client(self.client_user).post(
            "/api/bookings/", payload, format="json",
        )

    def test_required_question_left_unanswered_is_rejected(self):
        ServiceQuestion.objects.create(
            workspace=self.workspace,
            service=self.service,
            text="Allergies?",
            question_type="text",
            required=True,
        )
        res = self._book()
        self.assertEqual(res.status_code, 400)

    def test_answering_the_required_question_succeeds(self):
        question = ServiceQuestion.objects.create(
            workspace=self.workspace,
            service=self.service,
            text="Allergies?",
            question_type="text",
            required=True,
        )
        res = self._book({str(question.id): "None"})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["custom_answers"], {str(question.id): "None"})

    def test_optional_question_can_be_left_unanswered(self):
        ServiceQuestion.objects.create(
            workspace=self.workspace,
            service=self.service,
            text="Anything else?",
            question_type="text",
            required=False,
        )
        res = self._book()
        self.assertEqual(res.status_code, 201, res.data)

    def test_an_invalid_choice_is_rejected(self):
        question = ServiceQuestion.objects.create(
            workspace=self.workspace,
            service=self.service,
            text="Preferred style?",
            question_type="choice",
            choices="Short, Medium, Long",
            required=True,
        )
        res = self._book({str(question.id): "Extra long"})
        self.assertEqual(res.status_code, 400)

    def test_a_valid_choice_is_accepted(self):
        question = ServiceQuestion.objects.create(
            workspace=self.workspace,
            service=self.service,
            text="Preferred style?",
            question_type="choice",
            choices="Short, Medium, Long",
            required=True,
        )
        res = self._book({str(question.id): "Medium"})
        self.assertEqual(res.status_code, 201, res.data)

    def test_updating_an_existing_booking_does_not_re_ask_questions(self):
        question = ServiceQuestion.objects.create(
            workspace=self.workspace,
            service=self.service,
            text="Allergies?",
            question_type="text",
            required=True,
        )
        res = self._book({str(question.id): "None"})
        booking_id = res.data["id"]
        res = auth_client(self.client_user).patch(
            f"/api/bookings/{booking_id}/", {"notes": "Please call ahead"},
        )
        self.assertEqual(res.status_code, 200, res.data)


class GuestBookingAnswerValidationTests(IntakeQuestionTestCase):
    """The same required-question/valid-choice rules apply to a
    guest booking through the public flow (BOOK-21), since
    PublicBookingSerializer inherits BookingSerializer.validate()
    unchanged.
    """

    def setUp(self):
        super().setUp()
        self.workspace.public_booking_enabled = True
        self.workspace.save(update_fields=["public_booking_enabled"])
        self.api = APIClient()

    def _book(self, custom_answers=None):
        payload = {
            "service": self.service.id,
            "start_time": f"{MONDAY}T09:00:00Z",
            "client_name": "Jamie Guest",
            "client_email": "jamie@example.com",
        }
        if custom_answers is not None:
            payload["custom_answers"] = custom_answers
        return self.api.post(
            f"/api/public/{self.workspace.slug}/bookings/",
            payload,
            format="json",
        )

    def test_guest_must_answer_a_required_question(self):
        ServiceQuestion.objects.create(
            workspace=self.workspace,
            service=self.service,
            text="Allergies?",
            question_type="text",
            required=True,
        )
        res = self._book()
        self.assertEqual(res.status_code, 400)

    def test_guest_can_book_after_answering(self):
        question = ServiceQuestion.objects.create(
            workspace=self.workspace,
            service=self.service,
            text="Allergies?",
            question_type="text",
            required=True,
        )
        res = self._book({str(question.id): "None"})
        self.assertEqual(res.status_code, 201, res.data)
