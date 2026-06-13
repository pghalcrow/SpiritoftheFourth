import unittest

from backend.shared.submissions_mapping import (
    map_sheet_submission_row,
    map_processed_payment_row,
    map_payment_hold_row,
    map_live_submission,
    IMPORT_FALLBACK_SUBMITTED_AT,
    parse_sheet_datetime,
)


class SubmissionsMappingTest(unittest.TestCase):
    def test_maps_sheet1_row_to_submission_record(self):
        headers = ["Form", "SubmittedDate", "Name", "Email", "Phone"]
        values = ["Car Show Entry Request", "2024-03-26 16:00", "George Rumble", "46.55george@cox.net", "760-703-4833"]
        record = map_sheet_submission_row(
            worksheet="Sheet1",
            row_number=2,
            headers=headers,
            values=values,
        )

        self.assertEqual(record["recordType"], "submission")
        self.assertEqual(record["pk"], "SUBMISSION")
        self.assertTrue(record["submissionId"].startswith("import-sheet1-2-"))
        self.assertEqual(len(record["submissionId"].rsplit("-", 1)[1]), 12)
        self.assertEqual(record["sk"], f"{record['submittedAt']}#{record['submissionId']}")
        self.assertEqual(record["source"], "Sheet1")
        self.assertEqual(record["submissionTitle"], "Car Show Entry Request")
        self.assertEqual(record["submittedAt"], "2024-03-26T16:00:00-07:00")
        self.assertEqual(record["name"], "George Rumble")
        self.assertEqual(record["email"], "46.55george@cox.net")
        self.assertEqual(record["phone"], "760-703-4833")
        self.assertEqual(record["status"], "New")
        self.assertEqual(record["assignedTo"], "")
        self.assertEqual(record["notes"], "")
        self.assertEqual(record["updatedBy"], "import")
        self.assertEqual(record["paymentStatus"], "unknown")
        self.assertEqual(record["paymentProvider"], "unknown")
        self.assertIsNone(record["amount"])
        self.assertEqual(record["currency"], "USD")
        self.assertEqual(record["rawData"]["worksheet"], "Sheet1")
        self.assertEqual(record["rawData"]["rowNumber"], 2)
        self.assertEqual(record["rawData"]["headers"], headers)
        self.assertEqual(record["rawData"]["values"], values)
        self.assertIn("createdAt", record)
        self.assertEqual(record["createdAt"], record["updatedAt"])

    def test_maps_event_submission_row_without_header_difference(self):
        record = map_sheet_submission_row(
            worksheet="Event Submissions",
            row_number=8,
            headers=["Submissions", "Date", "Name", "Email", "Phone"],
            values=["Golf Fundraiser Order", "2026-03-16 21:12", "Resa Coopat", "resacoopat15@gmail.com", "6194176739"],
        )

        self.assertEqual(record["submissionTitle"], "Golf Fundraiser Order")
        self.assertEqual(record["submittedAt"], "2026-03-16T21:12:00-07:00")
        self.assertEqual(record["source"], "Event Submissions")
        self.assertTrue(record["submissionId"].startswith("import-event-submissions-8-"))

    def test_parse_sheet_datetime_returns_now_for_blank_values(self):
        self.assertRegex(parse_sheet_datetime(None), r"^\d{4}-\d{2}-\d{2}T")
        self.assertRegex(parse_sheet_datetime("   "), r"^\d{4}-\d{2}-\d{2}T")

    def test_parse_sheet_datetime_returns_cleaned_original_for_unknown_format(self):
        self.assertEqual(parse_sheet_datetime("  not a date  "), "not a date")

    def test_sheet_row_with_blank_date_uses_deterministic_import_fallback(self):
        record = map_sheet_submission_row(
            worksheet="Sheet1",
            row_number=12,
            headers=["Form", "SubmittedDate", "Name", "Email", "Phone"],
            values=["Volunteer", "", "Pat", "pat@example.com", "555-1212"],
        )

        self.assertEqual(record["submittedAt"], IMPORT_FALLBACK_SUBMITTED_AT)
        self.assertEqual(record["sk"], f"{IMPORT_FALLBACK_SUBMITTED_AT}#{record['submissionId']}")

    def test_maps_payment_hold_row(self):
        record = map_payment_hold_row(
            worksheet="Event Hold",
            row_number=2,
            submission_id="abc123",
            payload_json='{"type":"golfEvent","formData":{"fullName":"Pat","email":"pat@example.com"}}',
        )

        self.assertEqual(record["recordType"], "payment_hold")
        self.assertEqual(record["pk"], "PAYMENT_HOLD")
        self.assertEqual(record["sk"], "abc123")
        self.assertEqual(record["submissionId"], "abc123")
        self.assertEqual(record["payload"]["type"], "golfEvent")
        self.assertEqual(record["rawData"]["worksheet"], "Event Hold")
        self.assertEqual(record["rawData"]["rowNumber"], 2)
        self.assertIn("createdAt", record)
        self.assertIn("updatedAt", record)
        self.assertEqual(record["updatedAt"], record["createdAt"])

    def test_maps_processed_payment_row(self):
        values = ["sub123", "2026-03-25 20:36"]
        record = map_processed_payment_row("Processed Submissions", 4, values)

        self.assertEqual(record["recordType"], "processed_payment")
        self.assertEqual(record["pk"], "PROCESSED_PAYMENT")
        self.assertEqual(record["sk"], "sub123")
        self.assertEqual(record["submissionId"], "sub123")
        self.assertEqual(record["processedAt"], "2026-03-25T20:36:00-07:00")
        self.assertEqual(record["provider"], "unknown")
        self.assertEqual(record["providerSessionId"], "")
        self.assertEqual(record["rawData"]["worksheet"], "Processed Submissions")
        self.assertEqual(record["rawData"]["rowNumber"], 4)
        self.assertEqual(record["rawData"]["values"], values)
        self.assertIn("createdAt", record)
        self.assertIn("updatedAt", record)
        self.assertEqual(record["updatedAt"], record["createdAt"])

    def test_processed_payment_row_requires_submission_id_and_date_column(self):
        with self.assertRaisesRegex(ValueError, "Processed Submissions row 9"):
            map_processed_payment_row("Processed Submissions", 9, [""])

    def test_maps_live_submission_defaults_payment_fields(self):
        record = map_live_submission(
            submission_id="live-2",
            title="New Vendor Application Submission",
            name="Vendor Contact",
            email="vendor@example.com",
            phone="555-1212",
            source="vendor",
            raw_data={"vendorType": "Business"},
        )

        self.assertEqual(record["recordType"], "submission")
        self.assertEqual(record["submissionId"], "live-2")
        self.assertEqual(record["sk"], f"{record['submittedAt']}#{record['submissionId']}")
        self.assertEqual(record["paymentStatus"], "none")
        self.assertEqual(record["paymentProvider"], "none")
        self.assertEqual(record["status"], "New")
        self.assertEqual(record["updatedBy"], "system")
        self.assertEqual(record["createdAt"], record["submittedAt"])
        self.assertEqual(record["updatedAt"], record["submittedAt"])

    def test_maps_live_submission_with_payment_fields(self):
        record = map_live_submission(
            submission_id="live-1",
            title="New Vendor Application Submission",
            name="Vendor Contact",
            email="vendor@example.com",
            phone="555-1212",
            source="vendor",
            raw_data={"vendorType": "Business", "grandTotal": 125},
            payment_status="paid",
            payment_provider="stripe",
            amount=125,
            currency="USD",
        )

        self.assertEqual(record["recordType"], "submission")
        self.assertEqual(record["submissionId"], "live-1")
        self.assertEqual(record["paymentStatus"], "paid")
        self.assertEqual(record["paymentProvider"], "stripe")
        self.assertEqual(record["amount"], 125)
        self.assertEqual(record["currency"], "USD")

    def test_maps_live_submission_accepts_stable_submitted_at(self):
        record = map_live_submission(
            submission_id="live-1",
            title="New Vendor Application Submission",
            name="Vendor Contact",
            email="vendor@example.com",
            phone="555-1212",
            source="vendor",
            raw_data={"vendorType": "Business"},
            submitted_at="2026-06-05T10:00:00-07:00",
        )

        self.assertEqual(record["submittedAt"], "2026-06-05T10:00:00-07:00")
        self.assertEqual(record["sk"], "2026-06-05T10:00:00-07:00#live-1")


if __name__ == "__main__":
    unittest.main()
