import base64
import json
import os
import re
from decimal import Decimal

import boto3

from backend.shared.submissions_repository import SubmissionsRepository


s3 = boto3.client("s3")

BUCKET_NAME = os.environ.get("BUCKET_NAME")
SITE_BUCKET_NAME = os.environ.get("SITE_BUCKET_NAME")
FILE_KEY = "events.json"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")


def lambda_handler(event, context):
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    print(f"Received request for {raw_path}")

    if http_method == "GET" and raw_path == "/events":
        return get_events()

    if http_method == "POST" and raw_path == "/admin/login":
        return admin_login(event)

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
        if http_method == "PATCH":
            submission_id = raw_path.rsplit("/", 1)[-1]
            body = json.loads(event.get("body", "{}"))
            return update_submission_admin_fields(submission_id, body)

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
            "headers": {
                "Content-Type": "application/json",
            },
            "body": content,
        }

    except Exception as e:
        return json_response(500, {"error": str(e)})


def admin_login(event):
    try:
        body = json.loads(event.get("body", "{}"))
        password = body.get("password", "")

        if password == ADMIN_PASSWORD:
            return json_response(200, {"success": True, "token": "cms-admin-token"})
        return json_response(200, {"success": False})
    except Exception as e:
        return json_response(500, {"success": False, "error": str(e)})


def is_authorized(event):
    headers = event.get("headers", {})
    auth_header = headers.get("authorization") or headers.get("Authorization")

    if not auth_header:
        return False

    token = auth_header.replace("Bearer ", "")
    return token == "cms-admin-token"


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
