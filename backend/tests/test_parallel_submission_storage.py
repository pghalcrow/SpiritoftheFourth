import importlib
import json
import sys
import types
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from boto3.dynamodb.types import TypeSerializer


def import_create_order_app():
    module_dir = Path(__file__).resolve().parents[1] / "lambdas" / "create_order"
    sys.path.insert(0, str(module_dir))
    if "stripe" not in sys.modules:
        try:
            importlib.import_module("stripe")
        except ImportError:
            sys.modules["stripe"] = types.SimpleNamespace()
    return importlib.import_module("app")


def import_sotf_mailer():
    module_dir = Path(__file__).resolve().parents[1] / "lambdas" / "sotf_mailer"
    sys.path.insert(0, str(module_dir))
    sys.modules.setdefault("pytz", types.SimpleNamespace(timezone=lambda _name: None))
    return importlib.import_module("lambda_function")


class FakeEmailSender:
    def __init__(self):
        self.sent = []
        self.sent_with_attachments = []

    def format_email(self, _template, _context):
        return "<html></html>"

    def build_form_fields_html(self, _form_data):
        return "<table></table>"

    def send_email(self, **_kwargs):
        self.sent.append(_kwargs)
        return True

    def send_email_with_s3_attachments(self, **_kwargs):
        self.sent_with_attachments.append(_kwargs)
        return True


class ParallelSubmissionStorageTests(unittest.TestCase):
    def test_mailer_lambda_handles_cors_preflight_for_file_uploads(self):
        mailer = import_sotf_mailer()

        response = mailer.lambda_handler(
            {
                "requestContext": {"http": {"method": "OPTIONS"}},
                "headers": {
                    "Origin": "http://localhost:4200",
                    "Access-Control-Request-Method": "POST",
                },
            },
            None,
        )

        self.assertEqual(response["statusCode"], 204)
        self.assertEqual(response["headers"]["Access-Control-Allow-Origin"], "http://localhost:4200")
        self.assertIn("POST", response["headers"]["Access-Control-Allow-Methods"])

    def test_mailer_post_response_does_not_duplicate_function_url_cors_headers(self):
        mailer = import_sotf_mailer()
        event = {
            "headers": {"Origin": "https://spiritofthefourth.org"},
            "body": json.dumps({
                "toContact": "pghalcrow@gmail.com",
                "subject": "New Volunteer Request",
                "replyTo": "pat@example.com",
                "name": "Pat Halcrow",
                "phone": "555-1212",
                "body": "<html>Volunteer details</html>",
                "formType": "volunteerForm",
            })
        }

        with patch.object(mailer, "send_email", return_value=True), \
            patch.object(mailer, "record_submission_parallel"), \
            patch.dict(mailer.os.environ, {
                "USERNAME": "sender@example.com",
                "PASSWORD": "password",
                "SMTPHOST": "smtp.example.com",
                "SMTPPORT": "587",
            }):
            response = mailer.lambda_handler(event, None)

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["headers"], {"Content-Type": "application/json"})

    def test_mailer_test_mode_routes_admin_email_to_test_recipient(self):
        mailer = import_sotf_mailer()

        with patch.object(mailer, "is_test_mode", return_value=True), \
            patch.dict(mailer.os.environ, {"TEST_MODE_EMAIL": "pghalcrow@gmail.com"}, clear=True):
            recipients = mailer.resolve_email_recipients("live@example.com", ["reply@example.com"])

        self.assertEqual(recipients["send_to"], ["pghalcrow@gmail.com"])
        self.assertEqual(recipients["header_to"], "pghalcrow@gmail.com")
        self.assertEqual(recipients["original_to"], "live@example.com, reply@example.com")

    def test_mailer_defaults_from_header_to_no_reply(self):
        mailer = import_sotf_mailer()

        with patch.dict(mailer.os.environ, {"EMAIL_TRANSPORT": "ses"}, clear=True):
            source_email = mailer.get_source_email("adm.spiritofthefourth@gmail.com")

        self.assertEqual(source_email, "no-reply@spiritofthefourth.org")

    def test_mailer_records_submission_even_when_google_sheet_append_fails(self):
        mailer = import_sotf_mailer()
        event = {
            "body": json.dumps({
                "toContact": "pghalcrow@gmail.com",
                "subject": "New Volunteer Request - Name: Pat Halcrow | Email: pat@example.com",
                "replyTo": "pat@example.com",
                "name": "Pat Halcrow",
                "phone": "555-1212",
                "body": "<html>Volunteer details</html>",
                "formType": "volunteerForm",
            })
        }

        with patch.object(mailer, "send_email", return_value=True), \
            patch.object(mailer, "update_google_sheet", side_effect=RuntimeError("sheet unavailable")), \
            patch.object(mailer, "create_submission_record") as create_submission_record, \
            patch.dict(mailer.os.environ, {
                "USERNAME": "sender@example.com",
                "PASSWORD": "password",
                "SMTPHOST": "smtp.example.com",
                "SMTPPORT": "587",
            }):
            response = mailer.lambda_handler(event, None)

        self.assertEqual(response["statusCode"], 200)
        create_submission_record.assert_called_once()
        self.assertEqual(create_submission_record.call_args.kwargs["form"], "New Volunteer Request")

    def test_no_payment_vendor_updates_google_sheet_and_dynamodb(self):
        app = import_create_order_app()
        email_sender = FakeEmailSender()
        form_data = {
            "contactName": "Pat Halcrow",
            "companyName": "Pat Booth",
            "email": "pat@example.com",
            "phone": "555-1212",
            "toContact": "vendor@example.com",
            "vendorType": "Non-Profit",
        }

        with patch.object(app, "EmailSender", return_value=email_sender), \
            patch.object(app, "generate_vendor_form_pdf", return_value=None), \
            patch.object(app, "update_google_sheet") as update_google_sheet, \
            patch.object(app, "create_submission_record") as create_submission_record, \
            patch.dict(app.os.environ, {"RESA_EMAIL": "resa@example.com", "PO_VENDOR_EMAIL": "vendor-po@example.com"}):
            app.send_vendor_emails_direct(form_data, "submission-1")

        self.assertTrue(all(
            message["subject"] == "New Vendor Application Submission - Name: Pat Booth | Email: pat@example.com"
            for message in [*email_sender.sent, *email_sender.sent_with_attachments]
        ))
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

    def test_create_stripe_embedded_session_uses_test_key_and_returns_test_publishable_key_in_test_mode(self):
        app = import_create_order_app()

        class FakeStripeOrderService:
            api_keys = []

            def __init__(self, api_key):
                self.api_keys.append(api_key)

            def create_embedded_checkout_session(self, **_kwargs):
                return {"statusCode": 200, "body": json.dumps({"client_secret": "cs_test_secret"})}

        with patch.object(app, "is_test_mode", return_value=True), \
            patch.object(app, "StripeOrderService", FakeStripeOrderService), \
            patch.object(app, "store_dynamic_submission"), \
            patch.dict(app.os.environ, {
                "ENVIRONMENT": "prod",
                "RETURN_URL": "https://spiritofthefourth.org",
                "STRIPE_API_KEY": "sk_live_real",
                "STRIPE_TEST_API_KEY": "sk_test_real",
                "STRIPE_TEST_PUBLISHABLE_KEY": "pk_test_real",
            }, clear=True):
            response = app.lambda_handler({
                "action": "createStripeEmbeddedSession",
                "type": "sponsor",
                "email": "buyer@example.com",
                "grandTotal": 100,
            }, None)

        self.assertEqual(FakeStripeOrderService.api_keys, ["sk_test_real"])
        body = json.loads(response["body"])
        self.assertEqual(body["client_secret"], "cs_test_secret")
        self.assertEqual(body["publishable_key"], "pk_test_real")

    def test_freedom_club_donation_builds_payment_line_item(self):
        app = import_create_order_app()

        items = app.build_stripe_line_items({
            "type": "freedomClubDonation",
            "grandTotal": 150,
        })

        self.assertEqual(items, [{
            "price_data": {
                "currency": "usd",
                "product_data": {"name": "Freedom Club Donation"},
                "unit_amount": 15000,
            },
            "quantity": 1,
        }])

    def test_freedom_club_donation_meta_uses_officer_recipients_from_payload(self):
        app = import_create_order_app()

        event_meta = app.get_event_meta(
            "freedomClubDonation",
            {},
            {"toContact": "dave@example.com, myrna@example.com"},
            "resa@example.com",
        )

        self.assertEqual(event_meta["event_title"], "Freedom Club Donation")
        self.assertEqual(event_meta["contact_emails"], ["dave@example.com", "myrna@example.com"])

    def test_transaction_receipts_do_not_render_order_id(self):
        app = import_create_order_app()
        sender = app.EmailSender.__new__(app.EmailSender)
        context = app.build_email_context(
            "Freedom Club Donation",
            "txn_123",
            {
                "date_of_event": "",
                "location_of_event": "",
                "end_blurb": "",
                "contact_email": "officer@example.com",
                "additional_team_members": [],
            },
            {
                "first_name": "Pat",
                "last_name": "Halcrow",
                "full_name": "Pat Halcrow",
                "email": "pat@example.com",
            },
            "<tr><td>Donation</td><td>1</td><td>$100.00</td></tr>",
            "",
            "",
            "100.00",
            "06/22/2026",
        )

        buyer_body = sender.format_email("emails/buyer__receipt.html", context)
        seller_body = sender.format_email("emails/seller__po.html", context)

        self.assertNotIn("Order ID", seller_body)
        self.assertNotIn("Order number", buyer_body)
        self.assertNotIn("txn_123", buyer_body)
        self.assertNotIn("txn_123", seller_body)

    def test_freedom_club_admin_receipt_replaces_records_with_donor_summary(self):
        app = import_create_order_app()
        sender = app.EmailSender.__new__(app.EmailSender)
        context = app.build_email_context(
            "Freedom Club Donation",
            "txn_123",
            {
                "date_of_event": "",
                "location_of_event": "",
                "end_blurb": "",
                "contact_email": "officer@example.com",
                "additional_team_members": [],
            },
            {
                "first_name": "Pat",
                "last_name": "Halcrow",
                "full_name": "Pat Halcrow",
                "email": "pat@example.com",
            },
            "<tr><td>Donation</td><td>1</td><td>$150.00</td></tr>",
            "",
            app.build_freedom_club_admin_details_rows({
                "fullName": "Pat Halcrow",
                "phone": "555-1212",
                "email": "pat@example.com",
            }, "150.00"),
            "150.00",
            "06/22/2026",
            admin_details_heading="",
        )

        seller_body = sender.format_email("emails/seller__po.html", context)

        self.assertNotIn("Records", seller_body)
        self.assertIn("Name", seller_body)
        self.assertIn("Pat Halcrow", seller_body)
        self.assertIn("Phone Number", seller_body)
        self.assertIn("555-1212", seller_body)
        self.assertIn("Email", seller_body)
        self.assertIn("pat@example.com", seller_body)
        self.assertIn("Donation Amount", seller_body)
        self.assertIn("$150.00", seller_body)

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

    def test_create_order_sheet_timestamps_use_pacific_time(self):
        app = import_create_order_app()
        appended_rows = []

        class FakeWorksheet:
            def append_row(self, row):
                appended_rows.append(row)

            def get_all_values(self):
                return []

        with patch.object(app, "get_worksheet", return_value=FakeWorksheet()), \
            patch.object(app, "pacific_sheet_timestamp", return_value="2026-06-15 13:30"):
            app.update_google_sheet("Volunteer", "Pat", "pat@example.com", "555-1212", "Sheet1")
            app.mark_google_processed_submission("sub-1")

        self.assertEqual(appended_rows[0][1], "2026-06-15 13:30")
        self.assertEqual(appended_rows[1][1], "2026-06-15 13:30")

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

    def test_paid_submission_amount_is_dynamodb_safe_decimal(self):
        app = import_create_order_app()

        class FakeRepo:
            def __init__(self):
                self.record = None

            def create_submission(self, record):
                self.record = record

        repo = FakeRepo()

        with patch.object(app, "get_submissions_repository", return_value=repo):
            app.create_submission_record(
                form="motorShowOrder Order",
                name="Pat Halcrow",
                email="pat@example.com",
                phone="555-1212",
                source="motorShowOrder",
                raw_data={
                    "submission_id": "paid-1",
                    "pricing": {
                        "pricePerPlayer": 110.0,
                        "addOns": [{"field": "Tee Sign Hole Sponsor", "price": 100.0}],
                    },
                    "grandTotal": 210.0,
                },
                payment_status="paid",
                payment_provider="stripe",
                amount=89.0,
            )

        TypeSerializer().serialize(repo.record)
        self.assertEqual(repo.record["amount"], Decimal("89.0"))
        self.assertEqual(repo.record["rawData"]["pricing"]["pricePerPlayer"], Decimal("110.0"))
        self.assertEqual(repo.record["rawData"]["pricing"]["addOns"][0]["price"], Decimal("100.0"))
        self.assertEqual(repo.record["rawData"]["grandTotal"], Decimal("210.0"))

    def test_stripe_buyer_info_uses_first_and_last_name(self):
        app = import_create_order_app()

        buyer_info = app.get_stripe_buyer_info(
            {"customer_email": "pat@example.com"},
            {"firstName": "Pat", "lastName": "Halcrow", "email": "form@example.com"},
        )

        self.assertEqual(buyer_info["full_name"], "Pat Halcrow")
        self.assertEqual(buyer_info["first_name"], "Pat")
        self.assertEqual(buyer_info["last_name"], "Halcrow")

    def test_event_meta_supports_multiple_contact_emails(self):
        app = import_create_order_app()

        event_meta = app.get_event_meta(
            "golfEvent",
            {
                "title": "Golf Fundraiser",
                "eventMeta": {
                    "contactEmail": "legacy@example.com",
                    "contactEmails": ["first@example.com", "second@example.com", ""],
                },
            },
            {"teamMembers": []},
            "resa@example.com",
        )

        self.assertEqual(event_meta["contact_email"], "first@example.com, second@example.com")
        self.assertEqual(event_meta["contact_emails"], ["first@example.com", "second@example.com"])
        self.assertEqual(
            app.get_event_seller_recipients(event_meta, "resa@example.com"),
            {"resa@example.com", "first@example.com", "second@example.com"},
        )

    def test_motor_show_email_line_items_include_add_on_sizes_and_quantities(self):
        app = import_create_order_app()

        html = app.build_motor_show_items_html({
            "comboSize": "Large",
            "additionalPlaques": 2,
            "additionalSmall": 1,
            "additionalMedium": 0,
            "additionalLarge": 3,
            "additionalXLarge": 0,
            "additionalXXLarge": 1,
            "additionalXXXLarge": 0,
        })

        self.assertIn("Motor Show Entry", html)
        self.assertIn("T-Shirt & Plaque Bundle - Large", html)
        self.assertIn("Additional Plaque", html)
        self.assertIn(">2<", html)
        self.assertIn("Additional T-Shirt - Small", html)
        self.assertIn(">1<", html)
        self.assertIn("Additional T-Shirt - Large", html)
        self.assertIn(">3<", html)
        self.assertIn("Additional T-Shirt - XXLarge", html)
        self.assertNotIn("Additional T-Shirt - Medium", html)

    def test_free_dynamic_event_signup_updates_google_sheet_and_dynamodb(self):
        app = import_create_order_app()
        email_sender = FakeEmailSender()
        form_data = {
            "type": "freePicnic",
            "eventTitle": "Community Picnic",
            "fullName": "Pat Halcrow",
            "email": "pat@example.com",
            "phone": "555-1212",
            "grandTotal": 0,
            "pricing": {"pricePerPlayer": 0},
            "teamMembers": [],
        }

        with patch.object(app, "EmailSender", return_value=email_sender), \
            patch.object(app, "get_event_config", return_value={
                "title": "Community Picnic",
                "eventMeta": {
                    "dateOfEvent": "July 4, 2026",
                    "location": "Town Park",
                    "contactEmail": "event@example.com",
                },
                "sections": [{"type": "fields", "fields": ["fullName", "email", "phone"]}],
            }), \
            patch.object(app, "update_google_sheet") as update_google_sheet, \
            patch.object(app, "create_submission_record") as create_submission_record, \
            patch.dict(app.os.environ, {"RESA_EMAIL": "resa@example.com"}):
            response = app.process_free_event_signup(form_data, "free-1")

        self.assertEqual(response["status"], "submitted")
        self.assertEqual(response["submission_id"], "free-1")
        self.assertTrue(all(
            message["subject"] == "Community Picnic Signup - Name: Pat Halcrow | Email: pat@example.com"
            for message in email_sender.sent
        ))
        update_google_sheet.assert_called_once_with(
            form="Community Picnic Signup",
            name="Pat Halcrow",
            email="pat@example.com",
            phone="555-1212",
            sheet_name="Event Submissions",
        )
        create_submission_record.assert_called_once()
        self.assertEqual(create_submission_record.call_args.kwargs["payment_status"], "none")
        self.assertEqual(create_submission_record.call_args.kwargs["payment_provider"], "none")
        self.assertEqual(create_submission_record.call_args.kwargs["amount"], 0)

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
                "subject": "New Volunteer Request - Name: Pat Halcrow | Email: pat@example.com",
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

    def test_parade_mailer_request_records_stable_admin_title_not_email_subject(self):
        mailer = import_sotf_mailer()
        cases = [
            (
                "paradeEntryForm",
                "New Parade Entry Request - Name: Rancho Float | Contact: Pat Halcrow | Email: pat@example.com",
                "New Parade Entry Request - Parade",
            ),
            (
                "carEntryForm",
                "New Parade Car Entry Request - Name: Pat Driver | Email: driver@example.com",
                "New Parade Entry Request - Car",
            ),
            (
                "vipEntryForm",
                "New Parade VIP Entry Request: Name: Council Member Smith | Contact: Pat VIP | Email: vip@example.com",
                "New Parade Entry Request - VIP",
            ),
        ]

        for form_type, detailed_subject, expected_title in cases:
            with self.subTest(form_type=form_type):
                event = {
                    "body": json.dumps({
                        "toContact": "RBparadeSOTF@hotmail.com",
                        "subject": detailed_subject,
                        "replyTo": "pat@example.com",
                        "name": "Pat Halcrow",
                        "phone": "555-1212",
                        "body": "<html>Parade details</html>",
                        "formType": form_type,
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
                self.assertEqual(call_kwargs["form"], expected_title)
                self.assertEqual(call_kwargs["raw_data"]["subject"], detailed_subject)

    def test_motor_show_check_receipt_email_is_not_recorded_as_submission(self):
        mailer = import_sotf_mailer()
        event = {
            "body": json.dumps({
                "toContact": "pat@example.com",
                "subject": "Wheels of Freedom Motor Show — Entry Confirmation",
                "replyTo": "cowge41@gmail.com, tim@shinn.com",
                "name": "Spirit of the Fourth",
                "phone": "",
                "body": "Thank you for registering. Please mail your check.",
            })
        }

        with patch.object(mailer, "send_email", return_value=True) as send_email, \
            patch.object(mailer, "record_submission_parallel") as record_submission, \
            patch.dict(mailer.os.environ, {
                "USERNAME": "sender@example.com",
                "PASSWORD": "password",
                "SMTPHOST": "smtp.example.com",
                "SMTPPORT": "587",
            }):
            response = mailer.lambda_handler(event, None)

        self.assertEqual(response["statusCode"], 200)
        send_email.assert_called_once()
        record_submission.assert_not_called()

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

    def test_mailer_google_sheet_timestamp_uses_pacific_time(self):
        mailer = import_sotf_mailer()
        appended = []

        class FakeSheet:
            sheet1 = types.SimpleNamespace(append_row=lambda row: appended.append(row))

        class FakeClient:
            def open(self, _name):
                return FakeSheet()

        fake_gspread = types.SimpleNamespace(
            service_account=lambda _credential_path: FakeClient(),
        )

        with patch.dict(sys.modules, {"gspread": fake_gspread}), \
            patch.object(mailer, "pacific_sheet_timestamp", return_value="2026-06-15 13:30"):
            mailer.update_google_sheet("Volunteer", "Pat", "pat@example.com", "555-1212")

        self.assertEqual(appended[0][1], "2026-06-15 13:30")


if __name__ == "__main__":
    unittest.main()
