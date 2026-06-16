import json
import unittest
from decimal import Decimal
from unittest.mock import patch

import backend.lambdas.events_service.lambda_function as events_service


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

    def get_runtime_settings(self):
        return {"testMode": self.test_mode, "updatedBy": "", "updatedAt": ""}

    def set_runtime_test_mode(self, enabled, updated_by):
        self.test_mode = enabled
        return {"testMode": enabled, "updatedBy": updated_by, "updatedAt": "2026-06-15T12:00:00-07:00"}

    def list_submissions(self, limit=100):
        return {"items": [{"submissionId": "s1", "submissionTitle": "Volunteer", "status": "New"}]}

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
    def list_submissions(self, limit=100):
        return {"items": [{"submissionId": "s1", "amount": Decimal("125"), "rawData": {"rowNumber": Decimal("4")}}]}


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
    def test_authorized_admin_can_list_submissions(self, _repo):
        response = events_service.lambda_handler(make_event("GET", "/admin/submissions"), None)

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["items"][0]["submissionId"], "s1")

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
    def test_authorized_admin_can_delete_submission(self, _repo):
        response = events_service.lambda_handler(make_event("DELETE", "/admin/submissions/s1"), None)

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertTrue(body["success"])
        self.assertEqual(body["submissionId"], "s1")

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_delete_submission_returns_404_when_missing(self, _repo):
        response = events_service.lambda_handler(make_event("DELETE", "/admin/submissions/missing"), None)

        self.assertEqual(response["statusCode"], 404)

    def test_unauthorized_admin_cannot_delete_submission(self):
        response = events_service.lambda_handler(make_event("DELETE", "/admin/submissions/s1", token=None), None)

        self.assertEqual(response["statusCode"], 401)


if __name__ == "__main__":
    unittest.main()
