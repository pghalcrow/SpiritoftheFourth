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


if __name__ == "__main__":
    unittest.main()
