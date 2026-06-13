import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.local_server import (
    LOCAL_REPOSITORY,
    create_app,
    create_lambda_event,
    create_test_submission,
    get_local_submissions_repository,
)
from backend.shared.submissions_repository import SubmissionsRepository


class LocalServerTests(unittest.TestCase):
    def test_create_lambda_event_matches_function_url_shape(self):
        event = create_lambda_event("PATCH", "/admin/submissions/s1", {"status": "Complete"}, {"Authorization": "Bearer t"})

        self.assertEqual(event["requestContext"]["http"]["method"], "PATCH")
        self.assertEqual(event["rawPath"], "/admin/submissions/s1")
        self.assertEqual(json.loads(event["body"])["status"], "Complete")
        self.assertEqual(event["headers"]["Authorization"], "Bearer t")

    def test_create_test_submission_writes_local_repository(self):
        original_path = LOCAL_REPOSITORY.path
        try:
            import tempfile

            with tempfile.TemporaryDirectory() as tmp:
                LOCAL_REPOSITORY.path = LOCAL_REPOSITORY.path.__class__(tmp) / "submissions.json"
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

    def test_can_read_events_from_configured_local_events_file(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            events_file = Path(tmp) / "events.json"
            events_file.write_text(json.dumps({"events": [{"title": "Golf Fundraiser"}]}))

            with patch.dict(os.environ, {"LOCAL_EVENTS_FILE": str(events_file)}):
                client = create_app().test_client()
                response = client.get("/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["events"][0]["title"], "Golf Fundraiser")

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


if __name__ == "__main__":
    unittest.main()
