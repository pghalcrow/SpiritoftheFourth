import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.local_repository import LocalSubmissionsRepository
from backend.shared.submissions_mapping import map_live_submission
from backend.shared.submissions_repository import SubmissionsRepository

import backend.lambdas.events_service.lambda_function as events_service


LOCAL_EVENTS_FILE = Path(os.environ.get("LOCAL_EVENTS_FILE", "backend/.local/events.json"))
LOCAL_REPOSITORY = LocalSubmissionsRepository(os.environ.get("LOCAL_SUBMISSIONS_FILE", "backend/.local/submissions.json"))


def get_local_events_file():
    return Path(os.environ.get("LOCAL_EVENTS_FILE", str(LOCAL_EVENTS_FILE)))


def get_local_submissions_repository():
    if os.environ.get("LOCAL_USE_DYNAMODB", "").lower() in {"1", "true", "yes"}:
        return SubmissionsRepository(table_name=os.environ.get("SUBMISSIONS_TABLE", "sotf-submissions"))
    return LOCAL_REPOSITORY


def create_lambda_event(method, path, body=None, headers=None):
    return {
        "requestContext": {"http": {"method": method}},
        "rawPath": path,
        "headers": headers or {},
        "body": json.dumps(body or {}),
    }


def create_app():
    from flask import Flask, Response, jsonify, request

    app = Flask(__name__)
    os.environ.setdefault("ADMIN_PASSWORD", "admin")
    events_service.ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
    events_service.get_submissions_repository = get_local_submissions_repository
    events_service.get_events = local_get_events
    events_service.update_events = local_update_events

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
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,OPTIONS"
        return response

    @app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PATCH", "OPTIONS"])
    @app.route("/<path:path>", methods=["GET", "POST", "PATCH", "OPTIONS"])
    def lambda_route(path):
        if request.method == "OPTIONS":
            return Response(status=204)

        raw_path = f"/{path}"
        if raw_path == "/local/test-submission" and request.method == "POST":
            return jsonify(create_test_submission(request.get_json(silent=True) or {}))

        event = create_lambda_event(
            request.method,
            raw_path,
            request.get_json(silent=True) or {},
            dict(request.headers),
        )
        result = events_service.lambda_handler(event, None)
        return lambda_response(result)

    return app


def local_get_events():
    events_file = get_local_events_file()
    if not events_file.exists():
        events_file.parent.mkdir(parents=True, exist_ok=True)
        events_file.write_text(json.dumps({"events": []}, indent=2))
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": events_file.read_text(),
    }


def local_update_events(new_json):
    if "events" not in new_json:
        return events_service.json_response(400, {"error": "Missing 'events' key"})
    events_file = get_local_events_file()
    events_file.parent.mkdir(parents=True, exist_ok=True)
    events_file.write_text(json.dumps(new_json, indent=2))
    return events_service.json_response(200, {"success": True})


def create_test_submission(payload):
    submission_id = payload.get("submissionId") or uuid.uuid4().hex[:12]
    submitted_at = datetime.now(ZoneInfo("America/Los_Angeles")).isoformat(timespec="seconds")
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
