import tempfile
import unittest
from pathlib import Path

from backend.local_repository import LocalSubmissionsRepository


class LocalSubmissionsRepositoryTests(unittest.TestCase):
    def test_creates_lists_and_updates_submission_admin_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = LocalSubmissionsRepository(Path(tmp) / "submissions.json")
            repo.create_submission({
                "submissionId": "s1",
                "submissionTitle": "Volunteer",
                "submittedAt": "2026-06-05T10:00:00-07:00",
                "status": "New",
                "assignedTo": "",
                "notes": "",
            })

            self.assertEqual(repo.list_submissions()["items"][0]["submissionId"], "s1")

            updated = repo.update_submission_admin_fields("s1", "Complete", "Patrick", "Verified", "admin")

            self.assertEqual(updated["status"], "Complete")
            self.assertEqual(updated["assignedTo"], "Patrick")
            self.assertEqual(updated["notes"], "Verified")

    def test_updates_payment_received_without_overwriting_existing_admin_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = LocalSubmissionsRepository(Path(tmp) / "submissions.json")
            repo.create_submission({
                "submissionId": "s1",
                "submissionTitle": "New Motor Show Entry — Check Payment",
                "submittedAt": "2026-06-05T10:00:00-07:00",
                "status": "In Review",
                "assignedTo": "Patrick",
                "notes": "Waiting for check",
                "paymentReceived": False,
            })

            updated = repo.update_submission_admin_fields(
                "s1",
                notes="Check received",
                payment_received=True,
                updated_by="admin",
            )

            self.assertEqual(updated["status"], "In Review")
            self.assertEqual(updated["assignedTo"], "Patrick")
            self.assertEqual(updated["notes"], "Check received")
            self.assertTrue(updated["paymentReceived"])

    def test_list_submissions_returns_all_items_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = LocalSubmissionsRepository(Path(tmp) / "submissions.json")
            for index in range(105):
                repo.create_submission({
                    "submissionId": f"s{index}",
                    "submissionTitle": f"Submission {index}",
                    "submittedAt": f"2026-06-05T10:{index % 60:02d}:00-07:00",
                    "status": "New",
                    "assignedTo": "",
                    "notes": "",
                })

            result = repo.list_submissions()

            self.assertEqual(len(result["items"]), 105)


if __name__ == "__main__":
    unittest.main()
