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
    def list_submissions(self, limit=100):
        return {"items": [{"submissionId": "s1", "submissionTitle": "Volunteer", "status": "New"}]}

    def update_submission_admin_fields(self, submission_id, status, assigned_to, notes, updated_by):
        return {
            "submissionId": submission_id,
            "status": status,
            "assignedTo": assigned_to,
            "notes": notes,
            "updatedBy": updated_by,
        }


class DecimalRepo:
    def list_submissions(self, limit=100):
        return {"items": [{"submissionId": "s1", "amount": Decimal("125"), "rawData": {"rowNumber": Decimal("4")}}]}


class EventsServiceSubmissionRoutesTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
