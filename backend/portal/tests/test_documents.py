"""Document categories (DOC-04) and private documents (DOC-06).
The invariant that matters for privacy: a private document must be
invisible to the client, not just non-downloadable - and a client
can never make their own upload private, since that would hide it
from the very owner reviewing it.
"""
from django.test import TestCase, override_settings

from portal.models import Client, Document, Project, User, Workspace
from portal.tests.helpers import auth_client

LOCAL_STORAGE = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}


class DocumentTestCase(TestCase):
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
        self.project = Project.objects.create(
            workspace=self.workspace,
            client=self.client_profile,
            name="Website",
        )


class CategoryFilterTests(DocumentTestCase):
    def test_filters_by_category(self):
        Document.objects.create(
            project=self.project,
            original_name="contract.pdf",
            file="workspaces/1/contract.pdf",
            category="contract",
        )
        Document.objects.create(
            project=self.project,
            original_name="notes.pdf",
            file="workspaces/1/notes.pdf",
            category="reference",
        )
        res = auth_client(self.owner).get("/api/documents/?category=contract")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            [d["original_name"] for d in res.data], ["contract.pdf"]
        )


class PrivateDocumentTests(DocumentTestCase):
    def setUp(self):
        super().setUp()
        self.private_doc = Document.objects.create(
            project=self.project,
            original_name="internal.pdf",
            file="workspaces/1/internal.pdf",
            is_private=True,
        )
        self.public_doc = Document.objects.create(
            project=self.project,
            original_name="shared.pdf",
            file="workspaces/1/shared.pdf",
            is_private=False,
        )

    def test_owner_sees_both(self):
        res = auth_client(self.owner).get("/api/documents/")
        self.assertEqual(len(res.data), 2)

    def test_client_only_sees_public_document(self):
        res = auth_client(self.client_user).get("/api/documents/")
        self.assertEqual(
            [d["original_name"] for d in res.data], ["shared.pdf"]
        )

    def test_client_cannot_retrieve_private_document_by_id(self):
        res = auth_client(self.client_user).get(
            f"/api/documents/{self.private_doc.id}/"
        )
        self.assertEqual(res.status_code, 404)

    def test_owner_can_mark_a_document_private(self):
        res = auth_client(self.owner).patch(
            f"/api/documents/{self.public_doc.id}/", {"is_private": True}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.public_doc.refresh_from_db()
        self.assertTrue(self.public_doc.is_private)

    def test_client_cannot_make_own_visible_document_private(self):
        # public_doc is visible to the client, so they can reach it -
        # but a client marking their own upload private would just
        # hide it from the owner reviewing it, so it's ignored.
        self.public_doc.uploaded_by = self.client_user
        self.public_doc.save(update_fields=["uploaded_by"])
        res = auth_client(self.client_user).patch(
            f"/api/documents/{self.public_doc.id}/", {"is_private": True}
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.public_doc.refresh_from_db()
        self.assertFalse(self.public_doc.is_private)

    def test_serialized_document_never_exposes_the_raw_storage_url(self):
        # SEC-03: the storage backend's own URL is permanent and
        # unauthenticated - only a link back into this API (which
        # re-checks is_private on every fetch) may ever reach the
        # client.
        res = auth_client(self.owner).get(
            f"/api/documents/{self.public_doc.id}/"
        )
        self.assertNotIn("file", res.data)
        self.assertEqual(
            res.data["file_url"], f"/documents/{self.public_doc.id}/file/"
        )

    @override_settings(STORAGES=LOCAL_STORAGE)
    def test_a_missing_underlying_file_404s_instead_of_500ing(self):
        # public_doc's file="workspaces/1/shared.pdf" was never
        # actually written to storage - proving the endpoint handles
        # a legitimately vanished/corrupt storage object gracefully,
        # not just wrong permissions.
        res = auth_client(self.owner).get(
            f"/api/documents/{self.public_doc.id}/file/"
        )
        self.assertEqual(res.status_code, 404)


class UploadSafetyTests(TestCase):
    """Uploaded files are untrusted: nothing that can run script is
    ever served inline, and there is a per file size cap.
    """

    def test_html_and_svg_are_always_downloads(self):
        from io import BytesIO

        from portal.views import _safe_file_response

        for name in ("evil.html", "evil.svg", "evil.xml", "noextension"):
            response = _safe_file_response(BytesIO(b"<script>1</script>"), name)
            self.assertIn("attachment", response["Content-Disposition"])
            self.assertEqual(response["Content-Type"], "application/octet-stream")
            self.assertEqual(response["X-Content-Type-Options"], "nosniff")

    def test_pdf_and_png_may_render_inline(self):
        from io import BytesIO

        from portal.views import _safe_file_response

        for name, kind in (("a.pdf", "application/pdf"), ("a.png", "image/png")):
            response = _safe_file_response(BytesIO(b"x"), name)
            self.assertTrue(response["Content-Disposition"].startswith("inline"))
            self.assertEqual(response["Content-Type"], kind)

    def test_oversized_upload_is_rejected(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from rest_framework.serializers import ValidationError

        from portal.serializers import MAX_UPLOAD_BYTES, _check_upload_size

        big = SimpleUploadedFile("big.bin", b"x")
        big.size = MAX_UPLOAD_BYTES + 1
        with self.assertRaises(ValidationError):
            _check_upload_size(big)
        small = SimpleUploadedFile("ok.bin", b"x")
        self.assertIs(_check_upload_size(small), small)
