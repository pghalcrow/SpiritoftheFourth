import base64
import json
import os
import re
from decimal import Decimal

import boto3

from backend.shared.submissions_repository import SubmissionsRepository
from backend.shared.runtime_mode import is_local_test_mode


s3 = boto3.client("s3")

BUCKET_NAME = os.environ.get("BUCKET_NAME")
SITE_BUCKET_NAME = os.environ.get("SITE_BUCKET_NAME")
FILE_KEY = "events.json"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
DEVELOPER_PASSWORD = os.environ.get("DEVELOPER_PASSWORD", "C0ffeeCup0215")
ADMIN_TOKEN = "cms-admin-token"
DEVELOPER_TOKEN = "cms-developer-token"
NO_CACHE_HEADERS = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


def lambda_handler(event, context):
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    print(f"Received request for {raw_path}")

    if http_method == "GET" and raw_path == "/events":
        return get_events()

    if http_method == "POST" and raw_path == "/admin/login":
        return admin_login(event)

    if raw_path == "/admin/test-mode":
        if not is_developer_authorized(event):
            return json_response(403, {"error": "Developer role required"})
        if http_method == "GET":
            return get_test_mode()
        if http_method == "PATCH":
            body = json.loads(event.get("body", "{}"))
            return update_test_mode(body)

    if http_method == "POST" and raw_path == "/admin/events":
        if not is_authorized(event):
            return json_response(401, {"error": "Unauthorized"})

        body = json.loads(event.get("body", "{}"))
        return update_events(body)

    if http_method == "POST" and raw_path == "/admin/upload":
        if not is_authorized(event):
            return json_response(401, {"error": "Unauthorized"})

        body = json.loads(event.get("body", "{}"))
        return upload_image(body)

    if raw_path == "/admin/submissions":
        if not is_authorized(event):
            return json_response(401, {"error": "Unauthorized"})
        if http_method == "GET":
            return list_submissions(event)

    if raw_path.startswith("/admin/submissions/"):
        if not is_authorized(event):
            return json_response(401, {"error": "Unauthorized"})
        submission_id = raw_path.rsplit("/", 1)[-1]
        if http_method == "PATCH":
            body = json.loads(event.get("body", "{}"))
            return update_submission_admin_fields(submission_id, body)
        if http_method == "DELETE":
            return delete_submission(submission_id)

    return json_response(405, {"message": "Method Not Allowed"})


def json_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=json_default),
    }


def json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def get_submissions_repository():
    return SubmissionsRepository()


def get_events():
    try:
        response = s3.get_object(Bucket=BUCKET_NAME, Key=FILE_KEY)
        content = response["Body"].read().decode("utf-8")

        return {
            "statusCode": 200,
            "headers": NO_CACHE_HEADERS,
            "body": content,
        }

    except Exception as e:
        return json_response(500, {"error": str(e)})


def admin_login(event):
    try:
        body = json.loads(event.get("body", "{}"))
        password = body.get("password", "")

        if password == ADMIN_PASSWORD:
            return json_response(200, {"success": True, "token": ADMIN_TOKEN, "role": "admin"})
        if password == DEVELOPER_PASSWORD:
            return json_response(200, {"success": True, "token": DEVELOPER_TOKEN, "role": "developer"})
        return json_response(200, {"success": False})
    except Exception as e:
        return json_response(500, {"success": False, "error": str(e)})


def is_authorized(event):
    headers = event.get("headers", {})
    auth_header = headers.get("authorization") or headers.get("Authorization")

    if not auth_header:
        return False

    token = auth_header.replace("Bearer ", "")
    return token in {ADMIN_TOKEN, DEVELOPER_TOKEN}


def is_developer_authorized(event):
    headers = event.get("headers", {})
    auth_header = headers.get("authorization") or headers.get("Authorization")
    if not auth_header:
        return False
    return auth_header.replace("Bearer ", "") == DEVELOPER_TOKEN


def get_test_mode():
    if is_local_test_mode():
        return json_response(200, {"testMode": True, "localOnly": True})
    return json_response(200, get_submissions_repository().get_runtime_settings())


def update_test_mode(body):
    if is_local_test_mode():
        return json_response(200, {"testMode": True, "localOnly": True})
    updated = get_submissions_repository().set_runtime_test_mode(bool(body.get("enabled")), "developer")
    return json_response(200, updated)


def update_events(new_json):
    try:
        if "events" not in new_json:
            return json_response(400, {"error": "Missing 'events' key"})

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=FILE_KEY,
            Body=json.dumps(new_json),
            ContentType="application/json",
        )

        return json_response(200, {"success": True})

    except Exception as e:
        return json_response(500, {"error": str(e)})


def upload_image(data):
    try:
        original_file_name = data["fileName"]
        file_content = base64.b64decode(data["base64"])
        content_type = data.get("contentType", "application/octet-stream")

        allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
        if content_type not in allowed_types:
            return json_response(400, {"error": "Invalid file type"})

        safe_name = re.sub(r"[^A-Za-z0-9_\-\.]", "_", original_file_name)
        key = f"assets/{safe_name}"

        s3.put_object(Bucket=SITE_BUCKET_NAME, Key=key, Body=file_content, ContentType=content_type)

        return json_response(200, {"success": True, "url": key})

    except Exception as e:
        return json_response(500, {"error": str(e)})


def list_submissions(event):
    repo = get_submissions_repository()
    return json_response(200, repo.list_submissions(limit=100))


def update_submission_admin_fields(submission_id, body):
    allowed_statuses = {"New", "In Review", "Follow Up", "Complete", "Archived"}
    status = body.get("status", "New")
    if status not in allowed_statuses:
        return json_response(400, {"error": "Invalid status"})

    try:
        updated = get_submissions_repository().update_submission_admin_fields(
            submission_id=submission_id,
            status=status,
            assigned_to=body.get("assignedTo", ""),
            notes=body.get("notes", ""),
            updated_by="admin",
        )
        return json_response(200, updated)
    except KeyError as e:
        return json_response(404, {"error": str(e)})


def delete_submission(submission_id):
    try:
        deleted = get_submissions_repository().delete_submission(submission_id)
        return json_response(200, {"success": True, "submissionId": deleted["submissionId"]})
    except KeyError as e:
        return json_response(404, {"error": str(e)})
