import unittest

from backend.scripts.import_google_sheet import (
    import_hold_rows,
    import_processed_rows,
    import_submission_rows,
)
from backend.tests.test_submissions_repository import FakeTable
from backend.shared.submissions_repository import SubmissionsRepository


class ImportGoogleSheetTests(unittest.TestCase):
    def setUp(self):
        self.repo = SubmissionsRepository(table=FakeTable())

    def test_import_submission_rows_maps_sheet_rows(self):
        counts = {"submission": 0, "payment_hold": 0, "processed_payment": 0, "skipped": 0}

        import_submission_rows(
            "Sheet1",
            [
                ["Form", "SubmittedDate", "Name", "Email", "Phone"],
                ["Volunteer", "2026-06-05 10:00", "Pat", "pat@example.com", "555-1212"],
            ],
            self.repo,
            counts,
            dry_run=False,
        )

        result = self.repo.list_submissions(limit=10)
        self.assertEqual(counts["submission"], 1)
        self.assertEqual(result["items"][0]["submissionTitle"], "Volunteer")

    def test_import_hold_rows_maps_payment_holds(self):
        counts = {"submission": 0, "payment_hold": 0, "processed_payment": 0, "skipped": 0}

        import_hold_rows(
            "Event Hold",
            [["submission_id", "data"], ["hold-1", '{"formData":{"fullName":"Pat"}}']],
            self.repo,
            counts,
            dry_run=False,
        )

        self.assertEqual(counts["payment_hold"], 1)
        self.assertEqual(self.repo.get_payment_hold("hold-1")["formData"]["fullName"], "Pat")

    def test_import_processed_rows_maps_processed_markers(self):
        counts = {"submission": 0, "payment_hold": 0, "processed_payment": 0, "skipped": 0}

        import_processed_rows(
            "Processed Submissions",
            [["sub-1", "2026-03-25 20:36"]],
            self.repo,
            counts,
            dry_run=False,
        )

        self.assertEqual(counts["processed_payment"], 1)
        self.assertTrue(self.repo.is_processed_payment("sub-1"))


if __name__ == "__main__":
    unittest.main()
