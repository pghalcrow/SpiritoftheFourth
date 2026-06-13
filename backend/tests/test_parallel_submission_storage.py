import importlib
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


def import_create_order_app():
    module_dir = Path(__file__).resolve().parents[1] / "lambdas" / "create_order"
    sys.path.insert(0, str(module_dir))
    sys.modules.setdefault("stripe", types.SimpleNamespace())
    return importlib.import_module("app")


def import_sotf_mailer():
    module_dir = Path(__file__).resolve().parents[1] / "lambdas" / "sotf_mailer"
    sys.path.insert(0, str(module_dir))
    sys.modules.setdefault("pytz", types.SimpleNamespace(timezone=lambda _name: None))
    return importlib.import_module("lambda_function")


class FakeEmailSender:
    def format_email(self, _template, _context):
        return "<html></html>"

    def send_email(self, **_kwargs):
        return True

    def send_email_with_s3_attachments(self, **_kwargs):
        return True


class ParallelSubmissionStorageTests(unittest.TestCase):
    def test_no_payment_vendor_updates_google_sheet_and_dynamodb(self):
        app = import_create_order_app()
        form_data = {
            "contactName": "Pat Halcrow",
            "email": "pat@example.com",
            "phone": "555-1212",
            "toContact": "vendor@example.com",
            "vendorType": "Non-Profit",
        }

        with patch.object(app, "EmailSender", return_value=FakeEmailSender()), \
            patch.object(app, "generate_vendor_form_pdf", return_value=None), \
            patch.object(app, "update_google_sheet") as update_google_sheet, \
            patch.object(app, "create_submission_record") as create_submission_record, \
            patch.dict(app.os.environ, {"RESA_EMAIL": "resa@example.com", "PO_VENDOR_EMAIL": "vendor-po@example.com"}):
            app.send_vendor_emails_direct(form_data, "submission-1")

        update_google_sheet.assert_called_once_with(
            form="New Vendor Application Submission",
            name="Pat Halcrow",
            email="pat@example.com",
            phone="555-1212",
            sheet_name="Event Submissions",
        )
        create_submission_record.assert_called_once()

    def test_dynamic_submission_hold_updates_google_sheet_and_dynamodb(self):
        app = import_create_order_app()
        appended_rows = []

        class FakeWorksheet:
            def append_row(self, row):
                appended_rows.append(row)

        class FakeRepo:
            def __init__(self):
                self.saved = []

            def save_payment_hold(self, submission_id, payload):
                self.saved.append((submission_id, payload))

        repo = FakeRepo()

        with patch.object(app, "get_worksheet", return_value=FakeWorksheet()), \
            patch.object(app, "get_submissions_repository", return_value=repo):
            app.store_dynamic_submission({"type": "golfEvent", "title": "Golf", "fullName": "Pat"}, "hold-1")

        self.assertEqual(appended_rows[0][0], "hold-1")
        self.assertIn('"eventTitle": "Golf"', appended_rows[0][1])
        self.assertEqual(repo.saved[0][0], "hold-1")
        self.assertEqual(repo.saved[0][1]["eventTitle"], "Golf")

    def test_lookup_dynamic_submission_falls_back_to_google_sheet(self):
        app = import_create_order_app()

        class FakeWorksheet:
            def get_all_records(self):
                return [{"submission_id": "hold-1", "data": '{"formData":{"fullName":"Pat"}}'}]

        class FakeRepo:
            def get_payment_hold(self, _submission_id):
                return None

        with patch.object(app, "get_worksheet", return_value=FakeWorksheet()), \
            patch.object(app, "get_submissions_repository", return_value=FakeRepo()):
            payload = app.lookup_dynamic_submission("hold-1")

        self.assertEqual(payload["formData"]["fullName"], "Pat")

    def test_processed_marker_updates_google_sheet_once(self):
        app = import_create_order_app()
        appended_rows = []

        class FakeWorksheet:
            def get_all_values(self):
                return [["already-processed", "2026-06-05 10:00"]]

            def append_row(self, row):
                appended_rows.append(row)

        with patch.object(app, "get_worksheet", return_value=FakeWorksheet()):
            self.assertTrue(app.mark_google_processed_submission("new-submission"))
            self.assertFalse(app.mark_google_processed_submission("already-processed"))

        self.assertEqual(appended_rows[0][0], "new-submission")
        self.assertEqual(len(appended_rows), 1)

    def test_create_order_google_sheet_uses_local_environment_overrides(self):
        app = import_create_order_app()
        opened = []

        class FakeClient:
            def open(self, name):
                opened.append(name)
                return types.SimpleNamespace(worksheet=lambda sheet_name: sheet_name)

        fake_gspread = types.SimpleNamespace(
            SpreadsheetNotFound=Exception,
            WorksheetNotFound=Exception,
            service_account=lambda credential_path: opened.append(credential_path) or FakeClient(),
        )

        with patch.dict(sys.modules, {"gspread": fake_gspread}), \
            patch.dict(app.os.environ, {
                "GOOGLE_SHEET_CREDENTIALS": "/tmp/local-creds.json",
                "GOOGLE_SHEET_NAME": "Forms Submissions Local",
            }):
            worksheet = app.get_worksheet("Event Submissions")

        self.assertEqual(worksheet, "Event Submissions")
        self.assertEqual(opened, ["/tmp/local-creds.json", "Forms Submissions Local"])

    def test_mailer_records_submission_in_google_sheet_and_dynamodb(self):
        mailer = import_sotf_mailer()

        with patch.object(mailer, "update_google_sheet") as update_google_sheet, \
            patch.object(mailer, "create_submission_record") as create_submission_record:
            mailer.record_submission_parallel(
                form="Volunteer Request",
                name="Pat Halcrow",
                email="pat@example.com",
                phone="555-1212",
                source="volunteerForm",
                raw_data={"submission_id": "mailer-1"},
            )

        update_google_sheet.assert_called_once_with("Volunteer Request", "Pat Halcrow", "pat@example.com", "555-1212")
        create_submission_record.assert_called_once_with(
            form="Volunteer Request",
            name="Pat Halcrow",
            email="pat@example.com",
            phone="555-1212",
            source="volunteerForm",
            raw_data={"submission_id": "mailer-1"},
        )

    def test_normal_mailer_request_records_successful_volunteer_submission(self):
        mailer = import_sotf_mailer()
        event = {
            "body": json.dumps({
                "toContact": "pghalcrow@gmail.com",
                "subject": "New Volunteer Request",
                "replyTo": "pat@example.com",
                "name": "Pat Halcrow",
                "phone": "555-1212",
                "body": "<html>Volunteer details</html>",
                "formType": "volunteerForm",
                "availability": "Morning setup",
                "message": "Happy to help",
            })
        }

        with patch.object(mailer, "send_email", return_value=True), \
            patch.object(mailer, "record_submission_parallel") as record_submission, \
            patch.dict(mailer.os.environ, {
                "USERNAME": "sender@example.com",
                "PASSWORD": "password",
                "SMTPHOST": "smtp.example.com",
                "SMTPPORT": "587",
            }):
            response = mailer.lambda_handler(event, None)

        self.assertEqual(response["statusCode"], 200)
        record_submission.assert_called_once()
        call_kwargs = record_submission.call_args.kwargs
        self.assertEqual(call_kwargs["form"], "New Volunteer Request")
        self.assertEqual(call_kwargs["name"], "Pat Halcrow")
        self.assertEqual(call_kwargs["email"], "pat@example.com")
        self.assertEqual(call_kwargs["phone"], "555-1212")
        self.assertEqual(call_kwargs["source"], "volunteerForm")
        self.assertEqual(call_kwargs["raw_data"]["availability"], "Morning setup")
        self.assertIn("submission_id", call_kwargs["raw_data"])

    def test_mailer_google_sheet_uses_local_environment_overrides(self):
        mailer = import_sotf_mailer()
        appended = []

        class FakeSheet:
            sheet1 = types.SimpleNamespace(append_row=lambda row: appended.append(row))

        class FakeClient:
            def open(self, name):
                appended.append(name)
                return FakeSheet()

        fake_gspread = types.SimpleNamespace(
            service_account=lambda credential_path: appended.append(credential_path) or FakeClient(),
        )

        with patch.dict(sys.modules, {"gspread": fake_gspread}), \
            patch.dict(mailer.os.environ, {
                "GOOGLE_SHEET_CREDENTIALS": "/tmp/local-creds.json",
                "GOOGLE_SHEET_NAME": "Forms Submissions Local",
            }):
            mailer.update_google_sheet("Volunteer", "Pat", "pat@example.com", "555-1212")

        self.assertEqual(appended[0], "/tmp/local-creds.json")
        self.assertEqual(appended[1], "Forms Submissions Local")
        self.assertEqual(appended[2][0], "Volunteer")


if __name__ == "__main__":
    unittest.main()
