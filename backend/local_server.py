import base64
import json
import os
import re
import sys
import uuid
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend" / "lambdas" / "create_order"))

from backend.local_repository import LocalSubmissionsRepository
from backend.shared.submissions_mapping import map_live_submission
from backend.shared.submissions_repository import SubmissionsRepository
from backend.shared.time_utils import pacific_now_iso
from backend.shared.admin_auth import ROLE_ADMIN, ROLE_DEVELOPER, ROLE_SUPER_ADMIN, ROLE_VIEWER, normalize_role

import backend.lambdas.events_service.lambda_function as events_service
import backend.lambdas.create_order.app as create_order_app
import backend.lambdas.sotf_mailer.lambda_function as sotf_mailer


LOCAL_EVENTS_FILE = Path(os.environ.get("LOCAL_EVENTS_FILE", "backend/.local/events.json"))
LOCAL_REPOSITORY = LocalSubmissionsRepository(os.environ.get("LOCAL_SUBMISSIONS_FILE", "backend/.local/submissions.json"))
LOCAL_LAMBDA_EXPORT_DIR = Path(os.environ.get("LOCAL_LAMBDA_EXPORT_DIR", "aws-export/lambda"))


class LocalAdminAuthService:
    LOCAL_TEST_PASSWORD = "Bubbles123!@#"

    def __init__(self):
        self.users_path = Path(os.environ.get("LOCAL_ADMIN_USERS_FILE", "backend/.local/admin_users.json"))
        self.users = self._load_users()

    def _seed_users(self):
        return {
            "developer@example.com": {"email": "developer@example.com", "password": self.LOCAL_TEST_PASSWORD, "role": ROLE_DEVELOPER, "enabled": True, "status": "CONFIRMED"},
            "superadmin@example.com": {"email": "superadmin@example.com", "password": self.LOCAL_TEST_PASSWORD, "role": ROLE_SUPER_ADMIN, "enabled": True, "status": "CONFIRMED"},
            "admin@example.com": {"email": "admin@example.com", "password": self.LOCAL_TEST_PASSWORD, "role": ROLE_ADMIN, "enabled": True, "status": "CONFIRMED"},
            "viewer@example.com": {"email": "viewer@example.com", "password": self.LOCAL_TEST_PASSWORD, "role": ROLE_VIEWER, "enabled": True, "status": "CONFIRMED"},
        }

    def _load_users(self):
        if self.users_path.exists():
            try:
                data = json.loads(self.users_path.read_text() or "{}")
                if isinstance(data, dict) and data:
                    return data
            except json.JSONDecodeError:
                pass
        users = self._seed_users()
        self._save_users(users)
        return users

    def _save_users(self, users=None):
        self.users_path.parent.mkdir(parents=True, exist_ok=True)
        self.users_path.write_text(json.dumps(users or self.users, indent=2, sort_keys=True))

    def login(self, email, password):
        user = self.users.get(email)
        if user and user.get("enabled") is False:
            return {"success": False, "reason": "disabled"}
        if not user or user.get("password") != password:
            return {"success": False}
        if user.get("status") == "RESET_REQUIRED":
            return {
                "success": False,
                "challenge": "NEW_PASSWORD_REQUIRED",
                "session": "local-new-password",
                "email": email,
            }
        return {
            "success": True,
            "token": f"local-admin-token:{email}",
            "role": user["role"],
            "email": email,
        }

    def get_current_user(self, access_token):
        email = access_token.replace("local-admin-token:", "")
        user = self.users[email]
        if user.get("enabled") is False:
            raise PermissionError("Account is disabled")
        return {"email": email, "username": email, "role": user["role"]}

    def list_users(self):
        return {
            "items": [
                {key: value for key, value in user.items() if key != "password"}
                for user in self.users.values()
            ]
        }

    def create_user(self, email, role):
        normalized_email = str(email or "").strip().lower()
        normalized_role = normalize_role(role)
        if normalized_email in {key.lower() for key in self.users.keys()}:
            raise ValueError("An account using that email already exists.")
        self.users[normalized_email] = {
            "email": normalized_email,
            "password": "reset7",
            "role": normalized_role,
            "enabled": True,
            "status": "RESET_REQUIRED",
        }
        self._save_users()
        return {"email": normalized_email, "role": normalized_role}

    def delete_user(self, email):
        self.users.pop(email, None)
        self._save_users()
        return {"email": email}

    def update_user(self, email, role=None, enabled=None):
        if email not in self.users:
            raise KeyError(email)
        if role is not None:
            normalized_role = normalize_role(role)
            if not normalized_role:
                raise ValueError("Invalid role")
            self.users[email]["role"] = normalized_role
        if enabled is not None:
            self.users[email]["enabled"] = bool(enabled)
        self._save_users()
        return {key: value for key, value in self.users[email].items() if key != "password"}

    def request_password_reset(self, email):
        if email not in self.users:
            return {"success": True}
        reset_code = "local-reset"
        reset_url = (
            "http://localhost:4200/admin/reset-password"
            f"?email={quote(email)}&code={quote(reset_code)}"
        )
        return {"success": True, "resetCode": reset_code, "resetUrl": reset_url}

    def confirm_password_reset(self, email, code, password):
        if email not in self.users:
            raise ValueError("Account not found")
        self.users[email]["password"] = password
        self.users[email]["status"] = "CONFIRMED"
        self._save_users()
        return {"success": True}

    def complete_new_password_challenge(self, email, password, session):
        if email not in self.users or session != "local-new-password":
            raise ValueError("Invalid or expired setup session")
        self.users[email]["password"] = password
        self.users[email]["status"] = "CONFIRMED"
        self._save_users()
        return {
            "success": True,
            "token": f"local-admin-token:{email}",
            "role": self.users[email]["role"],
            "email": email,
        }


LOCAL_ADMIN_AUTH = LocalAdminAuthService()


def get_local_events_file():
    return Path(os.environ.get("LOCAL_EVENTS_FILE", str(LOCAL_EVENTS_FILE)))


def get_local_submissions_repository():
    if os.environ.get("LOCAL_USE_DYNAMODB", "").lower() in {"1", "true", "yes"}:
        return SubmissionsRepository(table_name=os.environ.get("SUBMISSIONS_TABLE", "sotf-submissions"))
    return LOCAL_REPOSITORY


def hydrate_local_integration_env():
    export_dir = Path(os.environ.get("LOCAL_LAMBDA_EXPORT_DIR", str(LOCAL_LAMBDA_EXPORT_DIR)))
    export_env_keys = {
        "sotf_mailer": ("USERNAME", "PASSWORD", "SMTPHOST", "SMTPPORT", "PDFSHIFTAPIKEY"),
        "create_order": (
            "STRIPE_API_KEY",
            "STRIPE_TEST_API_KEY",
            "STRIPE_PUBLISHABLE_KEY",
            "STRIPE_TEST_PUBLISHABLE_KEY",
            "WEBHOOK_SECRET",
            "STRIPE_TEST_WEBHOOK_SECRET",
            "PAYPAL_CLIENT_ID",
            "PAYPAL_CLIENT_SECRET",
            "PAYPAL_TEST_CLIENT_ID",
            "PAYPAL_TEST_CLIENT_SECRET",
        ),
    }

    for function_name, keys in export_env_keys.items():
        config_path = export_dir / f"{function_name}.get-function.json"
        if not config_path.exists():
            continue
        try:
            config = json.loads(config_path.read_text() or "{}")
            variables = (
                ((config.get("Configuration") or {}).get("Environment") or {}).get("Variables")
                or ((config.get("Environment") or {}).get("Variables") or {})
            )
            for key in keys:
                if variables.get(key):
                    os.environ.setdefault(key, str(variables[key]))
        except Exception as error:
            print(f"Could not hydrate local environment from {config_path}: {error}")

    if not os.environ.get("GOOGLE_SHEET_CREDENTIALS"):
        for credentials_path in (
            export_dir / "sotf_mailer" / "creds-sa.json",
            export_dir / "create_order" / "creds-sa.json",
        ):
            if credentials_path.exists():
                os.environ["GOOGLE_SHEET_CREDENTIALS"] = str(credentials_path)
                break


def create_lambda_event(method, path, body=None, headers=None, query_string_parameters=None):
    return {
        "requestContext": {"http": {"method": method}},
        "rawPath": path,
        "headers": headers or {},
        "queryStringParameters": query_string_parameters or {},
        "body": json.dumps(body or {}),
    }


def create_app():
    from flask import Flask, Response, jsonify, request

    app = Flask(__name__)
    os.environ.setdefault("ADMIN_PASSWORD", "admin")
    os.environ.setdefault("DEVELOPER_PASSWORD", "C0ffeeCup0215")
    os.environ.setdefault("LOCAL_TEST_MODE", "true")
    os.environ.setdefault("ENVIRONMENT", "dev")
    os.environ.setdefault("RETURN_URL", "http://localhost:4200")
    os.environ.setdefault("SUBMISSIONS_TABLE", "sotf-submissions-local")
    os.environ.setdefault("WEBHOOK_SECRET", "local-dev-webhook-secret")
    os.environ.setdefault("EMAIL_TRANSPORT", "ses")
    os.environ.setdefault("SES_SOURCE_EMAIL", "no-reply@spiritofthefourth.org")
    os.environ.setdefault("SES_REGION", "us-east-1")
    os.environ.setdefault("TEST_MODE_EMAIL", "pghalcrow@gmail.com")
    os.environ.setdefault("EMAIL_OVERRIDE_TO", "pghalcrow@gmail.com")
    os.environ.setdefault("LOCAL_WRITE_GOOGLE_SHEET", "true")
    os.environ.setdefault("RESA_EMAIL", "local@example.com")
    os.environ.setdefault("PO_MOTOR_SHOW_EMAIL_1", "local@example.com")
    os.environ.setdefault("PO_MOTOR_SHOW_EMAIL_2", "local@example.com")
    os.environ.setdefault("S3_ATTACHMENT_BUCKET", "sotf-file-upload-470065668628-us-west-2")
    hydrate_local_integration_env()
    events_service.ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
    events_service.DEVELOPER_PASSWORD = os.environ.get("DEVELOPER_PASSWORD")
    events_service.get_submissions_repository = get_local_submissions_repository
    events_service.get_events = local_get_events
    events_service.update_events = local_update_events
    events_service.upload_image = local_upload_image
    events_service.get_admin_auth_service = lambda: LOCAL_ADMIN_AUTH
    create_order_app.get_submissions_repository = get_local_submissions_repository
    create_order_app.get_worksheet = get_local_worksheet
    create_order_app.load_events_config = local_load_events_config
    sotf_mailer.get_submissions_repository = get_local_submissions_repository

    @app.after_request
    def add_cors(response):
        allowed_origins = {
            origin.strip()
            for origin in os.environ.get(
                "LOCAL_CORS_ORIGINS",
                "http://localhost:4200,http://127.0.0.1:4200",
            ).split(",")
            if origin.strip()
        }
        request_origin = request.headers.get("Origin")
        response.headers["Access-Control-Allow-Origin"] = (
            request_origin if request_origin in allowed_origins else "http://localhost:4200"
        )
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization,Cache-Control,Pragma"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS"
        return response

    @app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
    @app.route("/<path:path>", methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
    def lambda_route(path):
        if request.method == "OPTIONS":
            return Response(status=204)

        raw_path = f"/{path}"
        if raw_path == "/local/test-submission" and request.method == "POST":
            return jsonify(create_test_submission(request.get_json(silent=True) or {}))

        body = request.get_json(silent=True) or {}
        if body.get("action") == "processLocalStripeSession":
            return lambda_response(process_local_stripe_session(body.get("sessionId")))

        if is_order_request(body):
            result = create_order_app.lambda_handler(
                create_lambda_event(request.method, raw_path, body, dict(request.headers)),
                None,
            )
            return lambda_response(result)

        if is_mailer_request(body):
            result = sotf_mailer.lambda_handler(
                create_lambda_event(request.method, raw_path, body, dict(request.headers)),
                None,
            )
            return lambda_response(result)

        event = create_lambda_event(
            request.method,
            raw_path,
            body,
            dict(request.headers),
            dict(request.args),
        )
        result = events_service.lambda_handler(event, None)
        return lambda_response(result)

    return app


def is_order_request(body):
    if body.get("action") in {
        "createOrder",
        "captureOrder",
        "createStripeSession",
        "createStripeEmbeddedSession",
        "processFreeEventSignup",
    }:
        return True
    return body.get("event_type") in {"CHECKOUT.ORDER.APPROVED", "CHECKOUT.ORDER.COMPLETED"}


def is_mailer_request(body):
    if body.get("getSignedURLs"):
        return True
    return bool(body.get("subject") and body.get("body") and body.get("toContact"))


class LocalWorksheet:
    def __init__(self, name):
        self.name = name
        self.path = Path(os.environ.get("LOCAL_WORKSHEETS_FILE", "backend/.local/worksheets.json"))

    def _read(self):
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text() or "{}")

    def _write(self, data):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, indent=2, sort_keys=True))

    def append_row(self, row):
        data = self._read()
        data.setdefault(self.name, []).append(row)
        self._write(data)

    def get_all_values(self):
        return self._read().get(self.name, [])

    def get_all_records(self):
        rows = self.get_all_values()
        if not rows:
            return []
        headers = rows[0]
        return [dict(zip(headers, row)) for row in rows[1:]]


def get_local_worksheet(sheet_name):
    if os.environ.get("LOCAL_WRITE_GOOGLE_SHEET", "").lower() in {"1", "true", "yes"}:
        import gspread

        credentials_path = os.environ.get("GOOGLE_SHEET_CREDENTIALS", "creds-sa.json")
        spreadsheet_name = os.environ.get("GOOGLE_SHEET_NAME", "Forms Submissions")
        gc = gspread.service_account(credentials_path)
        return gc.open(spreadsheet_name).worksheet(sheet_name)

    return LocalWorksheet(sheet_name)


def local_load_events_config():
    return json.loads(local_get_events()["body"])


def process_local_stripe_session(session_id):
    if not session_id:
        return {"statusCode": 400, "body": json.dumps({"error": "Missing sessionId"})}

    stripe_service = create_order_app.StripeOrderService(create_order_app.get_stripe_secret_key())
    session_response = stripe_service.retrieve_session(session_id)
    if session_response.get("statusCode") != 200:
        return session_response

    session = json.loads(session_response.get("body") or "{}")
    if session.get("payment_status") != "paid":
        return {
            "statusCode": 409,
            "body": json.dumps({"error": "Stripe session is not paid", "payment_status": session.get("payment_status")}),
        }

    metadata = session.get("metadata", {}) or {}
    submission_id = metadata.get("submission_id")
    if submission_id and not LOCAL_REPOSITORY.get_payment_hold(submission_id):
        seed_local_payment_hold_from_worksheet(submission_id)

    stripe_event = {
        "type": "checkout.session.completed",
        "data": {"object": session},
    }

    original_construct_event = create_order_app.stripe.Webhook.construct_event
    create_order_app.stripe.Webhook.construct_event = lambda payload, sig_header, secret: stripe_event
    try:
        return create_order_app.lambda_handler(
            create_lambda_event("POST", "/", stripe_event, {"Stripe-Signature": "local-dev-signature"}),
            None,
        )
    finally:
        create_order_app.stripe.Webhook.construct_event = original_construct_event


def seed_local_payment_hold_from_worksheet(submission_id):
    rows = LocalWorksheet("Event Hold").get_all_values()
    for row in rows:
        if len(row) >= 2 and row[0] == submission_id:
            LOCAL_REPOSITORY.save_payment_hold(submission_id, json.loads(row[1]))
            return True
    return False


def local_get_events():
    events_file = get_local_events_file()
    if not events_file.exists():
        events_file.parent.mkdir(parents=True, exist_ok=True)
        events_file.write_text(json.dumps({"events": []}, indent=2))
    return {
        "statusCode": 200,
        "headers": events_service.NO_CACHE_HEADERS,
        "body": events_file.read_text(),
    }


def local_update_events(new_json):
    if "events" not in new_json:
        return events_service.json_response(400, {"error": "Missing 'events' key"})
    events_file = get_local_events_file()
    events_file.parent.mkdir(parents=True, exist_ok=True)
    events_file.write_text(json.dumps(new_json, indent=2))
    return events_service.json_response(200, {"success": True})


def local_upload_image(data):
    try:
        original_file_name = data["fileName"]
        file_content = base64.b64decode(data["base64"])
        content_type = data.get("contentType", "application/octet-stream")

        allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
        if content_type not in allowed_types:
            return events_service.json_response(400, {"error": "Invalid file type"})

        safe_name = re.sub(r"[^A-Za-z0-9_\-\.]", "_", original_file_name)
        assets_dir = Path(os.environ.get("LOCAL_ASSETS_DIR", "src/assets"))
        assets_dir.mkdir(parents=True, exist_ok=True)
        (assets_dir / safe_name).write_bytes(file_content)

        return events_service.json_response(200, {"success": True, "url": f"assets/{safe_name}"})

    except Exception as e:
        return events_service.json_response(500, {"error": str(e)})


def create_test_submission(payload):
    submission_id = payload.get("submissionId") or uuid.uuid4().hex[:12]
    submitted_at = pacific_now_iso()
    record = map_live_submission(
        submission_id=submission_id,
        title=payload.get("submissionTitle", "Local Test Submission"),
        name=payload.get("name", "Local Tester"),
        email=payload.get("email", "local@example.com"),
        phone=payload.get("phone", "555-0100"),
        source=payload.get("source", "local"),
        raw_data={**payload, "submission_id": submission_id},
        payment_status=payload.get("paymentStatus", "none"),
        payment_provider=payload.get("paymentProvider", "none"),
        amount=payload.get("amount"),
        currency=payload.get("currency", "USD"),
        submitted_at=submitted_at,
    )
    LOCAL_REPOSITORY.create_submission_if_missing(record)
    maybe_append_google_sheet(record)
    return record


def maybe_append_google_sheet(record):
    if os.environ.get("LOCAL_WRITE_GOOGLE_SHEET", "").lower() not in {"1", "true", "yes"}:
        return

    import gspread

    credentials_path = os.environ.get("GOOGLE_SHEET_CREDENTIALS", "creds-sa.json")
    sheet_name = os.environ.get("GOOGLE_SHEET_NAME", "Forms Submissions Local")
    worksheet_name = os.environ.get("GOOGLE_SHEET_WORKSHEET", "Sheet1")
    gc = gspread.service_account(credentials_path)
    worksheet = gc.open(sheet_name).worksheet(worksheet_name)
    worksheet.append_row([
        record.get("submissionTitle", ""),
        record.get("submittedAt", ""),
        record.get("name", ""),
        record.get("email", ""),
        record.get("phone", ""),
    ])


def lambda_response(result):
    from flask import Response

    body = result.get("body", "")
    status = result.get("statusCode", 200)
    headers = result.get("headers", {})
    return Response(body, status=status, headers=headers)


if __name__ == "__main__":
    port = int(os.environ.get("LOCAL_BACKEND_PORT", "5001"))
    create_app().run(host="127.0.0.1", port=port, debug=True)
