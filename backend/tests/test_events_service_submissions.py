import json
import unittest
from decimal import Decimal
from unittest.mock import patch

from botocore.exceptions import ClientError

import backend.lambdas.events_service.lambda_function as events_service
from backend.shared.admin_auth import ROLE_ADMIN, ROLE_DEVELOPER, ROLE_SUPER_ADMIN, ROLE_VIEWER


def make_event(method, path, body=None, token="cms-admin-token"):
    return {
        "requestContext": {"http": {"method": method}},
        "rawPath": path,
        "headers": {"Authorization": f"Bearer {token}"} if token else {},
        "body": json.dumps(body or {}),
    }


class FakeRepo:
    def __init__(self):
        self.test_mode = False
        self.last_list_limit = None
        self.last_list_cursor = None
        self.last_list_summary_only = None
        self.last_list_search = None
        self.password_setup_required = set()

    def get_runtime_settings(self):
        return {"testMode": self.test_mode, "updatedBy": "", "updatedAt": ""}

    def set_runtime_test_mode(self, enabled, updated_by):
        self.test_mode = enabled
        return {"testMode": enabled, "updatedBy": updated_by, "updatedAt": "2026-06-15T12:00:00-07:00"}

    def list_admin_user_setup_statuses(self):
        return {
            email: {"passwordSetupRequired": True}
            for email in self.password_setup_required
        }

    def mark_admin_user_password_setup_required(self, email):
        self.password_setup_required.add(email.strip().lower())
        return {"email": email.strip().lower(), "passwordSetupRequired": True}

    def mark_admin_user_password_setup_complete(self, email):
        self.password_setup_required.discard(email.strip().lower())
        return {"email": email.strip().lower(), "passwordSetupRequired": False}

    def list_submissions(self, limit=None):
        self.last_list_limit = limit
        return {"items": [{"submissionId": "s1", "submissionTitle": "Volunteer", "status": "New"}]}

    def list_submissions_page(self, limit=50, cursor=None, summary_only=True, group=None, search=None):
        self.last_list_limit = limit
        self.last_list_cursor = cursor
        self.last_list_summary_only = summary_only
        self.last_list_group = group
        self.last_list_search = search
        result = {
            "items": [{
                "submissionId": "s1",
                "submissionTitle": "Volunteer",
                "status": "New",
                "rawData": {"formType": "volunteerForm"},
            }],
            "lastEvaluatedKey": {"pk": "SUBMISSION", "sk": "2026-06-05T10:00:00-07:00#s1"},
        }
        if group:
            result["totalCount"] = 12
        if search:
            result["totalCount"] = 7
        return result

    def count_submissions(self, group=None):
        self.last_count_group = group
        return 12 if group == "vendor" else 125

    def get_submission(self, submission_id):
        if submission_id == "missing":
            raise KeyError(f"Submission not found: {submission_id}")
        return {
            "submissionId": submission_id,
            "submissionTitle": "Volunteer",
            "status": "New",
            "rawData": {"formType": "volunteerForm", "message": "Available morning"},
        }

    def update_submission_admin_fields(self, submission_id, status=None, assigned_to=None, notes=None, updated_by=None, payment_received=None):
        return {
            "submissionId": submission_id,
            "status": status if status is not None else "New",
            "assignedTo": assigned_to if assigned_to is not None else "",
            "notes": notes if notes is not None else "",
            "updatedBy": updated_by,
            "paymentReceived": payment_received,
        }

    def delete_submission(self, submission_id):
        if submission_id == "missing":
            raise KeyError(f"Submission not found: {submission_id}")
        return {"submissionId": submission_id}


class DecimalRepo:
    def list_submissions(self, limit=None):
        return {"items": [{"submissionId": "s1", "amount": Decimal("125"), "rawData": {"rowNumber": Decimal("4")}}]}

    def list_submissions_page(self, limit=50, cursor=None, summary_only=True, group=None, search=None):
        return {"items": [{"submissionId": "s1", "amount": Decimal("125"), "rawData": {"rowNumber": Decimal("4")}}]}

    def count_submissions(self, group=None):
        return 1


class FakeAuthService:
    def __init__(self):
        self.users = [
            {"email": "developer@example.com", "role": ROLE_DEVELOPER, "enabled": True, "status": "CONFIRMED"},
            {"email": "superAdmin@example.com", "role": ROLE_SUPER_ADMIN, "enabled": True, "status": "CONFIRMED"},
            {"email": "admin@example.com", "role": ROLE_ADMIN, "enabled": True, "status": "CONFIRMED"},
            {"email": "viewer@example.com", "role": ROLE_VIEWER, "enabled": True, "status": "CONFIRMED"},
        ]

    def login(self, email, password):
        if email == "super@example.com" and password == "secret7":
            return {"success": True, "token": "role:superAdmin", "role": ROLE_SUPER_ADMIN, "email": email}
        return {"success": False}

    def get_current_user(self, token):
        role = token.replace("role:", "")
        return {"email": f"{role}@example.com", "role": role}

    def list_users(self):
        return {"items": self.users}

    def create_user(self, email, role):
        self.users.append({"email": email, "role": role, "enabled": True, "status": "RESET_REQUIRED"})
        return {"email": email, "role": role}

    def delete_user(self, email):
        return {"email": email}

    def update_user(self, email, role=None, enabled=None):
        for user in self.users:
            if user["email"] == email:
                if role is not None:
                    user["role"] = role
                if enabled is not None:
                    user["enabled"] = enabled
                return user
        raise KeyError(email)

    def request_password_reset(self, email):
        return {"success": True}

    def confirm_password_reset(self, email, code, password):
        return {"success": True}

    def complete_new_password_challenge(self, email, password, session):
        return {
            "success": True,
            "token": "role:viewer",
            "role": ROLE_VIEWER,
            "email": email,
        }


class InvalidResetCodeAuthService(FakeAuthService):
    def confirm_password_reset(self, email, code, password):
        raise ClientError(
            {"Error": {"Code": "CodeMismatchException", "Message": "Invalid verification code provided"}},
            "ConfirmForgotPassword",
        )


class InvalidPasswordAuthService(FakeAuthService):
    def confirm_password_reset(self, email, code, password):
        raise ClientError(
            {"Error": {"Code": "InvalidPasswordException", "Message": "Password did not conform with policy"}},
            "ConfirmForgotPassword",
        )


class EventsServiceSubmissionRoutesTests(unittest.TestCase):
    def test_admin_login_returns_admin_role_for_admin_password(self):
        with patch.object(events_service, "ADMIN_PASSWORD", "admin-secret"):
            response = events_service.lambda_handler(
                make_event("POST", "/admin/login", {"password": "admin-secret"}, token=None),
                None,
            )

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertTrue(body["success"])
        self.assertEqual(body["token"], "cms-admin-token")
        self.assertEqual(body["role"], "admin")

    def test_admin_login_returns_developer_role_for_developer_password(self):
        response = events_service.lambda_handler(
            make_event("POST", "/admin/login", {"password": "C0ffeeCup0215"}, token=None),
            None,
        )

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertTrue(body["success"])
        self.assertEqual(body["token"], "cms-developer-token")
        self.assertEqual(body["role"], "developer")

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_cognito_login_returns_role_token_and_email(self, _auth):
        response = events_service.lambda_handler(
            make_event("POST", "/admin/login", {"email": "super@example.com", "password": "secret7"}, token=None),
            None,
        )

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertTrue(body["success"])
        self.assertEqual(body["token"], "role:superAdmin")
        self.assertEqual(body["role"], ROLE_SUPER_ADMIN)
        self.assertEqual(body["email"], "super@example.com")

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_developer_token_can_list_submissions(self, _repo):
        response = events_service.lambda_handler(
            make_event("GET", "/admin/submissions", token="cms-developer-token"),
            None,
        )

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["items"][0]["submissionId"], "s1")

    @patch.object(events_service, "get_submissions_repository")
    def test_developer_can_read_and_update_test_mode(self, get_repo):
        repo = FakeRepo()
        get_repo.return_value = repo

        read_response = events_service.lambda_handler(
            make_event("GET", "/admin/test-mode", token="cms-developer-token"),
            None,
        )
        update_response = events_service.lambda_handler(
            make_event("PATCH", "/admin/test-mode", {"enabled": True}, token="cms-developer-token"),
            None,
        )

        self.assertEqual(read_response["statusCode"], 200)
        self.assertFalse(json.loads(read_response["body"])["testMode"])
        self.assertEqual(update_response["statusCode"], 200)
        body = json.loads(update_response["body"])
        self.assertTrue(body["testMode"])
        self.assertEqual(body["updatedBy"], "developer")

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_admin_token_cannot_update_test_mode(self, _repo):
        response = events_service.lambda_handler(
            make_event("PATCH", "/admin/test-mode", {"enabled": True}, token="cms-admin-token"),
            None,
        )

        self.assertEqual(response["statusCode"], 403)

    def test_events_response_disables_caching(self):
        class Body:
            def read(self):
                return b'{"events": []}'

        with patch.object(events_service.s3, "get_object", return_value={"Body": Body()}):
            response = events_service.lambda_handler(make_event("GET", "/events", token=None), None)

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["headers"]["Cache-Control"], "no-store, no-cache, must-revalidate, max-age=0")
        self.assertEqual(response["headers"]["Pragma"], "no-cache")

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_authorized_admin_can_list_submissions(self, repo_factory):
        response = events_service.lambda_handler(make_event("GET", "/admin/submissions"), None)

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["items"][0]["submissionId"], "s1")
        self.assertEqual(repo_factory.return_value.last_list_limit, 50)
        self.assertIsNone(repo_factory.return_value.last_list_cursor)
        self.assertTrue(repo_factory.return_value.last_list_summary_only)
        self.assertIsNone(repo_factory.return_value.last_list_group)
        self.assertIsNone(repo_factory.return_value.last_count_group)
        self.assertIn("nextCursor", body)
        self.assertEqual(body["totalCount"], 125)
        self.assertEqual(body["totalPages"], 3)

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_list_submissions_accepts_limit_and_cursor(self, repo_factory):
        cursor = events_service.encode_submission_cursor({"pk": "SUBMISSION", "sk": "cursor-key"})
        event = make_event("GET", "/admin/submissions")
        event["queryStringParameters"] = {"limit": "25", "cursor": cursor}

        response = events_service.lambda_handler(event, None)

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(repo_factory.return_value.last_list_limit, 25)
        self.assertEqual(repo_factory.return_value.last_list_cursor, {"pk": "SUBMISSION", "sk": "cursor-key"})

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_list_submissions_uses_group_for_page_and_totals(self, repo_factory):
        event = make_event("GET", "/admin/submissions")
        event["queryStringParameters"] = {"limit": "5", "group": "vendor"}

        response = events_service.lambda_handler(event, None)

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(repo_factory.return_value.last_list_group, "vendor")
        self.assertFalse(hasattr(repo_factory.return_value, "last_count_group"))
        self.assertEqual(body["totalCount"], 12)
        self.assertEqual(body["totalPages"], 3)

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_list_submissions_passes_search_for_paged_results(self, repo_factory):
        event = make_event("GET", "/admin/submissions")
        event["queryStringParameters"] = {"limit": "3", "group": "vendor", "search": "alpha"}

        response = events_service.lambda_handler(event, None)

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(repo_factory.return_value.last_list_group, "vendor")
        self.assertEqual(repo_factory.return_value.last_list_search, "alpha")
        self.assertEqual(body["totalCount"], 7)
        self.assertEqual(body["totalPages"], 3)

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_list_submissions_can_return_full_rows_for_export(self, repo_factory):
        event = make_event("GET", "/admin/submissions")
        event["queryStringParameters"] = {"summary": "false"}

        response = events_service.lambda_handler(event, None)

        self.assertEqual(response["statusCode"], 200)
        self.assertFalse(repo_factory.return_value.last_list_summary_only)

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_authorized_admin_can_get_submission_detail(self, _repo):
        response = events_service.lambda_handler(make_event("GET", "/admin/submissions/s1"), None)

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["submissionId"], "s1")
        self.assertEqual(body["rawData"]["message"], "Available morning")

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_get_submission_detail_returns_404_when_missing(self, _repo):
        response = events_service.lambda_handler(make_event("GET", "/admin/submissions/missing"), None)

        self.assertEqual(response["statusCode"], 404)

    @patch.object(events_service, "get_submissions_repository", return_value=DecimalRepo())
    def test_admin_submissions_response_serializes_dynamodb_decimals(self, _repo):
        response = events_service.lambda_handler(make_event("GET", "/admin/submissions"), None)

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["items"][0]["amount"], 125)
        self.assertEqual(body["items"][0]["rawData"]["rowNumber"], 4)

    def test_unauthorized_admin_cannot_list_submissions(self):
        response = events_service.lambda_handler(make_event("GET", "/admin/submissions", token=None), None)

        self.assertEqual(response["statusCode"], 401)

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_viewer_can_list_but_cannot_patch_submissions(self, _auth, _repo):
        list_response = events_service.lambda_handler(make_event("GET", "/admin/submissions", token="role:viewer"), None)
        patch_response = events_service.lambda_handler(
            make_event("PATCH", "/admin/submissions/s1", {"notes": "No edit"}, token="role:viewer"),
            None,
        )

        self.assertEqual(list_response["statusCode"], 200)
        self.assertEqual(patch_response["statusCode"], 403)

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_authorized_admin_can_patch_submission_admin_fields(self, _repo):
        response = events_service.lambda_handler(
            make_event(
                "PATCH",
                "/admin/submissions/s1",
                {"status": "Complete", "assignedTo": "Patrick", "notes": "Verified"},
            ),
            None,
        )

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["submissionId"], "s1")
        self.assertEqual(body["status"], "Complete")
        self.assertEqual(body["assignedTo"], "Patrick")
        self.assertEqual(body["notes"], "Verified")

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_authorized_admin_can_patch_check_payment_received_without_status_fields(self, _repo):
        response = events_service.lambda_handler(
            make_event(
                "PATCH",
                "/admin/submissions/s1",
                {"notes": "Check received", "paymentReceived": True},
            ),
            None,
        )

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["submissionId"], "s1")
        self.assertEqual(body["notes"], "Check received")
        self.assertTrue(body["paymentReceived"])

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_super_admin_can_delete_submission(self, _repo):
        response = events_service.lambda_handler(make_event("DELETE", "/admin/submissions/s1", token="cms-developer-token"), None)

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertTrue(body["success"])
        self.assertEqual(body["submissionId"], "s1")

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_admin_cannot_delete_submission(self, _repo):
        response = events_service.lambda_handler(make_event("DELETE", "/admin/submissions/s1", token="cms-admin-token"), None)

        self.assertEqual(response["statusCode"], 403)

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_delete_submission_returns_404_when_missing(self, _repo):
        response = events_service.lambda_handler(make_event("DELETE", "/admin/submissions/missing", token="cms-developer-token"), None)

        self.assertEqual(response["statusCode"], 404)

    def test_unauthorized_admin_cannot_delete_submission(self):
        response = events_service.lambda_handler(make_event("DELETE", "/admin/submissions/s1", token=None), None)

        self.assertEqual(response["statusCode"], 401)

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_super_admin_can_create_admin_user(self, _auth):
        repo = FakeRepo()
        with patch.object(events_service, "get_submissions_repository", return_value=repo):
            response = events_service.lambda_handler(
                make_event("POST", "/admin/users", {"email": "new-admin@example.com", "role": ROLE_ADMIN}, token="role:superAdmin"),
                None,
            )

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["email"], "new-admin@example.com")
        self.assertEqual(body["role"], ROLE_ADMIN)
        self.assertEqual(body["status"], "RESET_REQUIRED")
        self.assertIn("new-admin@example.com", repo.password_setup_required)

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_list_admin_users_shows_password_setup_required_until_reset_is_confirmed(self, _auth):
        repo = FakeRepo()
        repo.password_setup_required.add("admin@example.com")

        with patch.object(events_service, "get_submissions_repository", return_value=repo):
            list_response = events_service.lambda_handler(
                make_event("GET", "/admin/users", token="role:superAdmin"),
                None,
            )
            confirm_response = events_service.lambda_handler(
                make_event(
                    "POST",
                    "/admin/password-reset/confirm",
                    {"email": "admin@example.com", "code": "123456", "password": "Bubbles123!"},
                    token=None,
                ),
                None,
            )
            updated_list_response = events_service.lambda_handler(
                make_event("GET", "/admin/users", token="role:superAdmin"),
                None,
            )

        self.assertEqual(list_response["statusCode"], 200)
        users = json.loads(list_response["body"])["items"]
        admin_user = next(user for user in users if user["email"] == "admin@example.com")
        self.assertEqual(admin_user["status"], "RESET_REQUIRED")

        self.assertEqual(confirm_response["statusCode"], 200)
        self.assertNotIn("admin@example.com", repo.password_setup_required)
        updated_users = json.loads(updated_list_response["body"])["items"]
        updated_admin_user = next(user for user in updated_users if user["email"] == "admin@example.com")
        self.assertEqual(updated_admin_user["status"], "CONFIRMED")

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_new_password_challenge_marks_password_setup_complete(self, _auth):
        repo = FakeRepo()
        repo.password_setup_required.add("viewer@example.com")

        with patch.object(events_service, "get_submissions_repository", return_value=repo):
            response = events_service.lambda_handler(
                make_event(
                    "POST",
                    "/admin/new-password",
                    {"email": "viewer@example.com", "password": "Bubbles123!", "session": "challenge-session"},
                    token=None,
                ),
                None,
            )

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["email"], "viewer@example.com")
        self.assertEqual(body["role"], ROLE_VIEWER)
        self.assertNotIn("viewer@example.com", repo.password_setup_required)

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_only_developer_can_list_developer_users(self, _auth):
        super_admin_response = events_service.lambda_handler(
            make_event("GET", "/admin/users", token="role:superAdmin"),
            None,
        )
        developer_response = events_service.lambda_handler(
            make_event("GET", "/admin/users", token="role:developer"),
            None,
        )

        self.assertEqual(super_admin_response["statusCode"], 200)
        super_admin_users = json.loads(super_admin_response["body"])["items"]
        self.assertNotIn("developer@example.com", [user["email"] for user in super_admin_users])

        self.assertEqual(developer_response["statusCode"], 200)
        developer_users = json.loads(developer_response["body"])["items"]
        self.assertIn("developer@example.com", [user["email"] for user in developer_users])

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_admin_cannot_create_admin_user_but_can_create_viewer(self, _auth):
        admin_response = events_service.lambda_handler(
            make_event("POST", "/admin/users", {"email": "admin2@example.com", "role": ROLE_ADMIN}, token="role:admin"),
            None,
        )
        viewer_response = events_service.lambda_handler(
            make_event("POST", "/admin/users", {"email": "viewer2@example.com", "role": ROLE_VIEWER}, token="role:admin"),
            None,
        )

        self.assertEqual(admin_response["statusCode"], 403)
        self.assertEqual(viewer_response["statusCode"], 200)

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_user_managers_cannot_delete_themselves(self, _auth):
        response = events_service.lambda_handler(
            make_event("DELETE", "/admin/users/superAdmin@example.com", token="role:superAdmin"),
            None,
        )

        self.assertEqual(response["statusCode"], 403)
        self.assertIn("Cannot remove your own account", json.loads(response["body"])["error"])

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_role_scoped_user_delete_rules_are_enforced(self, _auth):
        developer_response = events_service.lambda_handler(
            make_event("DELETE", "/admin/users/superAdmin@example.com", token="role:developer"),
            None,
        )
        super_admin_response = events_service.lambda_handler(
            make_event("DELETE", "/admin/users/admin@example.com", token="role:superAdmin"),
            None,
        )
        admin_viewer_response = events_service.lambda_handler(
            make_event("DELETE", "/admin/users/viewer@example.com", token="role:admin"),
            None,
        )
        admin_admin_response = events_service.lambda_handler(
            make_event("DELETE", "/admin/users/admin@example.com", token="role:admin"),
            None,
        )

        self.assertEqual(developer_response["statusCode"], 200)
        self.assertEqual(super_admin_response["statusCode"], 200)
        self.assertEqual(admin_viewer_response["statusCode"], 200)
        self.assertEqual(admin_admin_response["statusCode"], 403)

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_super_admin_can_update_role_and_enabled_for_scoped_users(self, _auth):
        role_response = events_service.lambda_handler(
            make_event("PATCH", "/admin/users/admin@example.com", {"role": ROLE_VIEWER}, token="role:superAdmin"),
            None,
        )
        enabled_response = events_service.lambda_handler(
            make_event("PATCH", "/admin/users/viewer@example.com", {"enabled": False}, token="role:superAdmin"),
            None,
        )

        self.assertEqual(role_response["statusCode"], 200)
        self.assertEqual(json.loads(role_response["body"])["role"], ROLE_VIEWER)
        self.assertEqual(enabled_response["statusCode"], 200)
        self.assertFalse(json.loads(enabled_response["body"])["enabled"])

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_user_update_requires_permission_for_current_and_new_role(self, _auth):
        admin_promote_response = events_service.lambda_handler(
            make_event("PATCH", "/admin/users/viewer@example.com", {"role": ROLE_ADMIN}, token="role:admin"),
            None,
        )
        admin_disable_admin_response = events_service.lambda_handler(
            make_event("PATCH", "/admin/users/admin@example.com", {"enabled": False}, token="role:admin"),
            None,
        )
        super_admin_developer_response = events_service.lambda_handler(
            make_event("PATCH", "/admin/users/developer@example.com", {"role": ROLE_VIEWER}, token="role:superAdmin"),
            None,
        )

        self.assertEqual(admin_promote_response["statusCode"], 403)
        self.assertEqual(admin_disable_admin_response["statusCode"], 403)
        self.assertEqual(super_admin_developer_response["statusCode"], 403)

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_user_managers_cannot_update_themselves(self, _auth):
        role_response = events_service.lambda_handler(
            make_event("PATCH", "/admin/users/superAdmin@example.com", {"role": ROLE_ADMIN}, token="role:superAdmin"),
            None,
        )
        enabled_response = events_service.lambda_handler(
            make_event("PATCH", "/admin/users/superAdmin@example.com", {"enabled": False}, token="role:superAdmin"),
            None,
        )

        self.assertEqual(role_response["statusCode"], 403)
        self.assertEqual(enabled_response["statusCode"], 403)

    @patch.object(events_service, "get_admin_auth_service", return_value=FakeAuthService())
    def test_password_reset_endpoints_are_public_and_policy_enforced_by_service(self, _auth):
        request_response = events_service.lambda_handler(
            make_event("POST", "/admin/password-reset", {"email": "viewer@example.com"}, token=None),
            None,
        )
        confirm_response = events_service.lambda_handler(
            make_event(
                "POST",
                "/admin/password-reset/confirm",
                {"email": "viewer@example.com", "code": "123456", "password": "abc1234"},
                token=None,
            ),
            None,
        )

        self.assertEqual(request_response["statusCode"], 200)
        self.assertEqual(confirm_response["statusCode"], 200)

    @patch.object(events_service, "get_admin_auth_service", return_value=InvalidResetCodeAuthService())
    def test_password_reset_confirm_returns_friendly_error_for_invalid_code(self, _auth):
        response = events_service.lambda_handler(
            make_event(
                "POST",
                "/admin/password-reset/confirm",
                {"email": "viewer@example.com", "code": "123456", "password": "abc1234"},
                token=None,
            ),
            None,
        )

        self.assertEqual(response["statusCode"], 400)
        body = json.loads(response["body"])
        self.assertIn("Invalid or expired reset code", body["error"])

    @patch.object(events_service, "get_admin_auth_service", return_value=InvalidPasswordAuthService())
    def test_password_reset_confirm_returns_complete_password_policy_error(self, _auth):
        response = events_service.lambda_handler(
            make_event(
                "POST",
                "/admin/password-reset/confirm",
                {"email": "viewer@example.com", "code": "123456", "password": "Bubbles123"},
                token=None,
            ),
            None,
        )

        self.assertEqual(response["statusCode"], 400)
        body = json.loads(response["body"])
        self.assertIn("uppercase", body["error"])
        self.assertIn("lowercase", body["error"])
        self.assertIn("number", body["error"])
        self.assertIn("symbol", body["error"])


if __name__ == "__main__":
    unittest.main()
