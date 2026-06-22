import json
import os
import sys
import types
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from backend.local_server import (
    LOCAL_REPOSITORY,
    create_app,
    create_lambda_event,
    create_test_submission,
    get_local_submissions_repository,
    get_local_worksheet,
    hydrate_local_integration_env,
    process_local_stripe_session,
    seed_local_payment_hold_from_worksheet,
)
from backend.local_repository import LocalSubmissionsRepository
from backend.shared.submissions_repository import SubmissionsRepository


class LocalServerTests(unittest.TestCase):
    def test_create_lambda_event_matches_function_url_shape(self):
        event = create_lambda_event("PATCH", "/admin/submissions/s1", {"status": "Complete"}, {"Authorization": "Bearer t"})

        self.assertEqual(event["requestContext"]["http"]["method"], "PATCH")
        self.assertEqual(event["rawPath"], "/admin/submissions/s1")
        self.assertEqual(json.loads(event["body"])["status"], "Complete")
        self.assertEqual(event["headers"]["Authorization"], "Bearer t")

    def test_create_lambda_event_includes_query_string_parameters(self):
        event = create_lambda_event(
            "GET",
            "/admin/submissions",
            headers={"Authorization": "Bearer t"},
            query_string_parameters={"limit": "50", "cursor": "next-page"},
        )

        self.assertEqual(event["queryStringParameters"], {"limit": "50", "cursor": "next-page"})

    def test_create_test_submission_writes_local_repository(self):
        original_path = LOCAL_REPOSITORY.path
        try:
            import tempfile

            with tempfile.TemporaryDirectory() as tmp:
                LOCAL_REPOSITORY.path = LOCAL_REPOSITORY.path.__class__(tmp) / "submissions.json"
                with patch.dict(os.environ, {"LOCAL_WRITE_GOOGLE_SHEET": "false"}):
                    record = create_test_submission({"submissionId": "local-1", "name": "Pat"})

                self.assertEqual(record["submissionId"], "local-1")
                self.assertEqual(LOCAL_REPOSITORY.list_submissions()["items"][0]["name"], "Pat")
        finally:
            LOCAL_REPOSITORY.path = original_path

    def test_cors_allows_127_frontend_origin(self):
        client = create_app().test_client()

        response = client.options(
            "/admin/login",
            headers={
                "Origin": "http://127.0.0.1:4200",
                "Access-Control-Request-Method": "POST",
            },
        )

        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://127.0.0.1:4200")

    def test_cors_allows_event_cache_busting_headers(self):
        client = create_app().test_client()

        response = client.options(
            "/events",
            headers={
                "Origin": "http://localhost:4200",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "cache-control,pragma",
            },
        )

        allowed_headers = response.headers["Access-Control-Allow-Headers"].lower()
        self.assertIn("cache-control", allowed_headers)
        self.assertIn("pragma", allowed_headers)

    def test_cors_allows_admin_delete_requests(self):
        client = create_app().test_client()

        response = client.options(
            "/admin/submissions/s1",
            headers={
                "Origin": "http://localhost:4200",
                "Access-Control-Request-Method": "DELETE",
            },
        )

        self.assertIn("DELETE", response.headers["Access-Control-Allow-Methods"])

    def test_create_app_sets_local_webhook_secret_default(self):
        with patch.dict(os.environ, {}, clear=True):
            create_app()

            self.assertEqual(os.environ["WEBHOOK_SECRET"], "local-dev-webhook-secret")
            self.assertEqual(os.environ["EMAIL_TRANSPORT"], "smtp")
            self.assertEqual(os.environ["TEST_MODE_EMAIL"], "pghalcrow@gmail.com")
            self.assertEqual(os.environ["EMAIL_OVERRIDE_TO"], "pghalcrow@gmail.com")
            self.assertEqual(os.environ["LOCAL_WRITE_GOOGLE_SHEET"], "true")
            self.assertEqual(os.environ["S3_ATTACHMENT_BUCKET"], "sotf-file-upload-470065668628-us-west-2")
            self.assertEqual(os.environ["LOCAL_TEST_MODE"], "true")

    def test_hydrate_local_integration_env_uses_lambda_exports_without_overriding_explicit_values(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            export_dir = Path(tmp)
            (export_dir / "sotf_mailer").mkdir()
            (export_dir / "sotf_mailer" / "creds-sa.json").write_text("{}")
            (export_dir / "sotf_mailer.get-function.json").write_text(json.dumps({
                "Configuration": {
                    "Environment": {
                        "Variables": {
                            "USERNAME": "mailer@example.com",
                            "PASSWORD": "secret",
                            "SMTPHOST": "smtp.example.com",
                            "SMTPPORT": "587",
                        }
                    }
                }
            }))

            with patch.dict(os.environ, {
                "LOCAL_LAMBDA_EXPORT_DIR": str(export_dir),
                "USERNAME": "explicit@example.com",
            }, clear=True):
                hydrate_local_integration_env()

                self.assertEqual(os.environ["USERNAME"], "explicit@example.com")
                self.assertEqual(os.environ["PASSWORD"], "secret")
                self.assertEqual(os.environ["SMTPHOST"], "smtp.example.com")
                self.assertEqual(os.environ["SMTPPORT"], "587")
                self.assertEqual(os.environ["GOOGLE_SHEET_CREDENTIALS"], str(export_dir / "sotf_mailer" / "creds-sa.json"))

    def test_hydrate_local_integration_env_loads_create_order_stripe_test_keys(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            export_dir = Path(tmp)
            (export_dir / "create_order.get-function.json").write_text(json.dumps({
                "Environment": {
                    "Variables": {
                        "STRIPE_API_KEY": "sk_live_real",
                        "STRIPE_TEST_API_KEY": "sk_test_real",
                        "STRIPE_PUBLISHABLE_KEY": "pk_live_real",
                        "STRIPE_TEST_PUBLISHABLE_KEY": "pk_test_real",
                        "STRIPE_TEST_WEBHOOK_SECRET": "whsec_test",
                        "WEBHOOK_SECRET": "whsec_live",
                    }
                }
            }))

            with patch.dict(os.environ, {"LOCAL_LAMBDA_EXPORT_DIR": str(export_dir)}, clear=True):
                hydrate_local_integration_env()

                self.assertEqual(os.environ["STRIPE_API_KEY"], "sk_live_real")
                self.assertEqual(os.environ["STRIPE_TEST_API_KEY"], "sk_test_real")
                self.assertEqual(os.environ["STRIPE_PUBLISHABLE_KEY"], "pk_live_real")
                self.assertEqual(os.environ["STRIPE_TEST_PUBLISHABLE_KEY"], "pk_test_real")
                self.assertEqual(os.environ["STRIPE_TEST_WEBHOOK_SECRET"], "whsec_test")
                self.assertEqual(os.environ["WEBHOOK_SECRET"], "whsec_live")

    def test_local_admin_test_mode_is_always_enabled_and_local_only(self):
        client = create_app().test_client()

        response = client.patch(
            "/admin/test-mode",
            json={"enabled": False},
            headers={"Authorization": "Bearer cms-developer-token"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"testMode": True, "localOnly": True})

    def test_local_admin_email_login_uses_local_auth_store(self):
        client = create_app().test_client()

        response = client.post(
            "/admin/login",
            json={"email": "developer@example.com", "password": "Bubbles123!@#"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body["success"])
        self.assertEqual(body["role"], "developer")
        self.assertEqual(body["email"], "developer@example.com")
        self.assertTrue(body["token"].startswith("local-admin-token:"))

    def test_local_admin_email_login_token_can_load_submissions(self):
        client = create_app().test_client()

        login_response = client.post(
            "/admin/login",
            json={"email": "developer@example.com", "password": "Bubbles123!@#"},
        )
        token = login_response.get_json()["token"]

        response = client.get(
            "/admin/submissions",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("items", response.get_json())

    def test_local_password_reset_returns_local_reset_link(self):
        client = create_app().test_client()

        response = client.post(
            "/admin/password-reset",
            json={"email": "viewer@example.com"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body["success"])
        self.assertEqual(body["resetCode"], "local-reset")
        self.assertIn("/admin/reset-password", body["resetUrl"])
        self.assertIn("viewer%40example.com", body["resetUrl"])
        self.assertIn("code=local-reset", body["resetUrl"])

    def test_local_password_reset_returns_local_reset_link_for_super_admin(self):
        client = create_app().test_client()

        response = client.post(
            "/admin/password-reset",
            json={"email": "superadmin@example.com"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body["success"])
        self.assertEqual(body["resetCode"], "local-reset")
        self.assertIn("/admin/reset-password", body["resetUrl"])
        self.assertIn("superadmin%40example.com", body["resetUrl"])
        self.assertIn("code=local-reset", body["resetUrl"])

    def test_local_password_reset_does_not_return_link_for_unknown_email(self):
        client = create_app().test_client()

        response = client.post(
            "/admin/password-reset",
            json={"email": "unknown@example.com"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body, {"success": True})

    def test_local_password_reset_confirm_rejects_unknown_email(self):
        client = create_app().test_client()

        response = client.post(
            "/admin/password-reset/confirm",
            json={"email": "unknown@example.com", "code": "local-reset", "password": "newpass7"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Account not found")

    def test_can_read_events_from_configured_local_events_file(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            events_file = Path(tmp) / "events.json"
            events_file.write_text(json.dumps({"events": [{"title": "Golf Fundraiser"}]}))

            with patch.dict(os.environ, {"LOCAL_EVENTS_FILE": str(events_file)}):
                client = create_app().test_client()
                response = client.get("/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store, no-cache, must-revalidate, max-age=0")
        self.assertEqual(response.headers["Pragma"], "no-cache")
        self.assertEqual(response.get_json()["events"][0]["title"], "Golf Fundraiser")

    def test_local_admin_upload_writes_image_to_configured_assets_dir(self):
        import base64
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            assets_dir = Path(tmp) / "assets"
            encoded = base64.b64encode(b"local image").decode("ascii")

            with patch.dict(os.environ, {"LOCAL_ASSETS_DIR": str(assets_dir)}):
                client = create_app().test_client()
                response = client.post(
                    "/admin/upload",
                    json={
                        "fileName": "new flyer.png",
                        "base64": encoded,
                        "contentType": "image/png",
                    },
                    headers={"Authorization": "Bearer cms-admin-token"},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_json(), {"success": True, "url": "assets/new_flyer.png"})
            self.assertEqual((assets_dir / "new_flyer.png").read_bytes(), b"local image")

    def test_can_use_dynamodb_repository_for_local_submissions(self):
        with patch.dict(
            os.environ,
            {
                "LOCAL_USE_DYNAMODB": "true",
                "AWS_DEFAULT_REGION": "us-west-2",
                "SUBMISSIONS_TABLE": "sotf-submissions",
            },
        ):
            repo = get_local_submissions_repository()

        self.assertIsInstance(repo, SubmissionsRepository)

    def test_local_server_routes_stripe_embedded_sessions_to_order_lambda(self):
        class FakeStripeOrderService:
            def __init__(self, _api_key):
                pass

            def create_embedded_checkout_session(self, **_kwargs):
                return {"statusCode": 200, "body": json.dumps({"client_secret": "cs_test_local_secret"})}

        with patch.dict(
            os.environ,
            {
                "RETURN_URL": "http://localhost:4200",
                "STRIPE_API_KEY": "sk_test_local",
                "SUBMISSIONS_TABLE": "sotf-submissions-local",
                "LOCAL_WRITE_GOOGLE_SHEET": "false",
            },
        ), patch("backend.local_server.create_order_app.StripeOrderService", FakeStripeOrderService):
            client = create_app().test_client()
            response = client.post(
                "/",
                json={
                    "action": "createStripeEmbeddedSession",
                    "type": "motorShowOrder",
                    "email": "local@example.com",
                    "total": 25,
                    "grandTotal": 25,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.data)["client_secret"], "cs_test_local_secret")

    def test_local_server_routes_mailer_payloads_to_mailer_lambda(self):
        with patch("backend.local_server.sotf_mailer.lambda_handler") as lambda_handler:
            lambda_handler.return_value = {"statusCode": 200, "body": json.dumps({"status": True})}
            client = create_app().test_client()

            response = client.post(
                "/",
                json={
                    "toContact": "dave@example.com",
                    "subject": "New Volunteer Request",
                    "replyTo": "pat@example.com",
                    "name": "Pat Halcrow",
                    "phone": "555-1212",
                    "body": "<p>Volunteer</p>",
                    "formType": "volunteerForm",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.data)["status"], True)

    def test_local_server_routes_presigned_upload_payloads_to_mailer_lambda(self):
        with patch("backend.local_server.sotf_mailer.lambda_handler") as lambda_handler:
            lambda_handler.return_value = {
                "statusCode": 200,
                "body": json.dumps({
                    "status": True,
                    "folderKey": "folder-1",
                    "signedURLs": {"vendor.pdf": {"url": "https://example.com", "fields": {}}},
                }),
            }
            client = create_app().test_client()

            response = client.post(
                "/",
                json={
                    "getSignedURLs": True,
                    "fileNames": ["vendor.pdf"],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.data)["folderKey"], "folder-1")
        self.assertEqual(lambda_handler.call_args.args[0]["rawPath"], "/")
        event = lambda_handler.call_args.args[0]
        self.assertEqual(json.loads(event["body"])["getSignedURLs"], True)
        self.assertEqual(json.loads(event["body"])["fileNames"], ["vendor.pdf"])

    def test_local_worksheet_can_write_to_configured_google_sheet(self):
        calls = []

        class FakeClient:
            def open(self, name):
                calls.append(("open", name))
                return types.SimpleNamespace(
                    worksheet=lambda worksheet_name: calls.append(("worksheet", worksheet_name)) or "real worksheet"
                )

        fake_gspread = types.SimpleNamespace(
            service_account=lambda credential_path: calls.append(("service_account", credential_path)) or FakeClient()
        )

        with patch.dict(sys.modules, {"gspread": fake_gspread}), patch.dict(
            os.environ,
            {
                "LOCAL_WRITE_GOOGLE_SHEET": "true",
                "GOOGLE_SHEET_CREDENTIALS": "/tmp/local-creds.json",
                "GOOGLE_SHEET_NAME": "Forms Submissions",
            },
        ):
            worksheet = get_local_worksheet("Event Submissions")

        self.assertEqual(worksheet, "real worksheet")
        self.assertEqual(calls, [
            ("service_account", "/tmp/local-creds.json"),
            ("open", "Forms Submissions"),
            ("worksheet", "Event Submissions"),
        ])

    def test_local_repository_persists_payment_holds(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            repo = LocalSubmissionsRepository(Path(tmp) / "submissions.json")

            repo.save_payment_hold("hold-1", {"formData": {"email": "local@example.com"}})

            self.assertEqual(
                repo.get_payment_hold("hold-1"),
                {"formData": {"email": "local@example.com"}},
            )

    def test_local_repository_serializes_decimal_amounts(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            repo = LocalSubmissionsRepository(Path(tmp) / "submissions.json")

            repo.create_submission({
                "submissionId": "sub-decimal",
                "submittedAt": "2026-06-14T07:00:00-07:00",
                "amount": Decimal("89.00"),
            })

            self.assertEqual(repo.list_submissions()["items"][0]["amount"], 89.0)

    def test_process_local_stripe_session_replays_completion_through_order_lambda(self):
        calls = []

        class FakeStripeOrderService:
            def __init__(self, api_key):
                calls.append(("service", api_key))

            def retrieve_session(self, session_id):
                calls.append(("retrieve", session_id))
                return {
                    "statusCode": 200,
                    "body": json.dumps({
                        "id": "cs_test_paid",
                        "payment_status": "paid",
                        "status": "complete",
                        "metadata": {
                            "event_type": "motorShowOrder",
                            "submission_id": "sub-1",
                        },
                    }),
                }

        with patch.dict(os.environ, {
            "LOCAL_TEST_MODE": "true",
            "STRIPE_API_KEY": "sk_live_local",
            "STRIPE_TEST_API_KEY": "sk_test_local",
        }), patch(
            "backend.local_server.create_order_app.StripeOrderService",
            FakeStripeOrderService,
        ), patch("backend.local_server.create_order_app.lambda_handler") as lambda_handler:
            lambda_handler.return_value = {"statusCode": 200, "body": json.dumps({"status": "webhook processed"})}

            result = process_local_stripe_session("cs_test_paid")

        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(calls, [("service", "sk_test_local"), ("retrieve", "cs_test_paid")])
        replay_event = lambda_handler.call_args.args[0]
        replay_body = json.loads(replay_event["body"])
        self.assertEqual(replay_body["type"], "checkout.session.completed")
        self.assertEqual(replay_body["data"]["object"]["id"], "cs_test_paid")
        self.assertIn("Stripe-Signature", replay_event["headers"])

    def test_seed_local_payment_hold_reads_legacy_local_worksheet_rows(self):
        import tempfile

        original_path = LOCAL_REPOSITORY.path
        original_holds_path = LOCAL_REPOSITORY.holds_path
        try:
            with tempfile.TemporaryDirectory() as tmp:
                tmp_path = Path(tmp)
                worksheet_path = tmp_path / "worksheets.json"
                LOCAL_REPOSITORY.path = tmp_path / "submissions.json"
                LOCAL_REPOSITORY.holds_path = tmp_path / "submissions_payment_holds.json"
                worksheet_path.write_text(json.dumps({
                    "Event Hold": [
                        ["sub-legacy", json.dumps({"formData": {"email": "legacy@example.com"}})]
                    ]
                }))

                with patch.dict(os.environ, {"LOCAL_WORKSHEETS_FILE": str(worksheet_path)}):
                    seeded = seed_local_payment_hold_from_worksheet("sub-legacy")

                self.assertTrue(seeded)
                self.assertEqual(
                    LOCAL_REPOSITORY.get_payment_hold("sub-legacy"),
                    {"formData": {"email": "legacy@example.com"}},
                )
        finally:
            LOCAL_REPOSITORY.path = original_path
            LOCAL_REPOSITORY.holds_path = original_holds_path


if __name__ == "__main__":
    unittest.main()
