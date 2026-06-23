import base64
import json
import os
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

from backend.shared.submissions_repository import SubmissionsRepository
from backend.shared.runtime_mode import is_local_test_mode
from backend.shared.admin_auth import (
    AdminAuthService,
    ROLE_ADMIN,
    ROLE_DEVELOPER,
    ROLE_SUPER_ADMIN,
    can_delete_submissions,
    can_edit,
    can_manage_role,
    can_manage_users,
    can_read,
    can_update_test_mode,
    normalize_role,
)


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
RESET_CODE_ERROR_MESSAGE = "Invalid or expired reset code. Request a new password reset code and use the newest email."
PASSWORD_POLICY_ERROR_MESSAGE = "Password does not meet policy. Use at least 8 characters and include uppercase, lowercase, number, and symbol."
ADMIN_INVITE_EXPIRATION_DAYS = int(os.environ.get("ADMIN_INVITE_EXPIRATION_DAYS", "7"))


def lambda_handler(event, context):
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")
    print(f"Received request for {raw_path}")

    if http_method == "GET" and raw_path == "/events":
        return get_events()

    if http_method == "POST" and raw_path == "/admin/login":
        return admin_login(event)

    if http_method == "POST" and raw_path == "/admin/password-reset":
        body = json.loads(event.get("body", "{}"))
        return request_password_reset(body)

    if http_method == "POST" and raw_path == "/admin/password-reset/confirm":
        body = json.loads(event.get("body", "{}"))
        return confirm_password_reset(body)

    if http_method == "POST" and raw_path == "/admin/new-password":
        body = json.loads(event.get("body", "{}"))
        return complete_new_password_challenge(body)

    if raw_path == "/admin/test-mode":
        user = get_authorized_user(event)
        if not user:
            return json_response(401, {"error": "Unauthorized"})
        if not can_update_test_mode(user["role"]):
            return json_response(403, {"error": "Developer role required"})
        if http_method == "GET":
            return get_test_mode()
        if http_method == "PATCH":
            body = json.loads(event.get("body", "{}"))
            return update_test_mode(body, user)

    if http_method == "POST" and raw_path == "/admin/events":
        user = get_authorized_user(event)
        if not user:
            return json_response(401, {"error": "Unauthorized"})
        if not can_edit(user["role"]):
            return json_response(403, {"error": "Edit access required"})

        body = json.loads(event.get("body", "{}"))
        return update_events(body)

    if http_method == "POST" and raw_path == "/admin/upload":
        user = get_authorized_user(event)
        if not user:
            return json_response(401, {"error": "Unauthorized"})
        if not can_edit(user["role"]):
            return json_response(403, {"error": "Edit access required"})

        body = json.loads(event.get("body", "{}"))
        return upload_image(body)

    if raw_path == "/admin/users":
        user = get_authorized_user(event)
        if not user:
            return json_response(401, {"error": "Unauthorized"})
        if not can_manage_users(user["role"]):
            return json_response(403, {"error": "User management access required"})
        if http_method == "GET":
            return list_admin_users(user)
        if http_method == "POST":
            body = json.loads(event.get("body", "{}"))
            return create_admin_user(body, user)

    if http_method == "POST" and raw_path.startswith("/admin/users/") and raw_path.endswith("/invite"):
        user = get_authorized_user(event)
        if not user:
            return json_response(401, {"error": "Unauthorized"})
        if not can_manage_users(user["role"]):
            return json_response(403, {"error": "User management access required"})
        email = unquote(raw_path[len("/admin/users/"):-len("/invite")].strip("/"))
        return resend_admin_user_invite(email, user)

    if raw_path.startswith("/admin/users/"):
        user = get_authorized_user(event)
        if not user:
            return json_response(401, {"error": "Unauthorized"})
        if not can_manage_users(user["role"]):
            return json_response(403, {"error": "User management access required"})
        email = unquote(raw_path.rsplit("/", 1)[-1])
        if http_method == "PATCH":
            body = json.loads(event.get("body", "{}"))
            return update_admin_user(email, body, user)
        if http_method == "DELETE":
            return delete_admin_user(email, user)

    if raw_path == "/admin/submissions":
        user = get_authorized_user(event)
        if not user:
            return json_response(401, {"error": "Unauthorized"})
        if not can_read(user["role"]):
            return json_response(403, {"error": "Read access required"})
        if http_method == "GET":
            return list_submissions(event)

    if raw_path.startswith("/admin/submissions/"):
        user = get_authorized_user(event)
        if not user:
            return json_response(401, {"error": "Unauthorized"})
        submission_id = raw_path.rsplit("/", 1)[-1]
        if http_method == "GET":
            if not can_read(user["role"]):
                return json_response(403, {"error": "Read access required"})
            return get_submission_detail(unquote(submission_id))
        if http_method == "PATCH":
            if not can_edit(user["role"]):
                return json_response(403, {"error": "Edit access required"})
            body = json.loads(event.get("body", "{}"))
            return update_submission_admin_fields(submission_id, body, user)
        if http_method == "DELETE":
            if not can_delete_submissions(user["role"]):
                return json_response(403, {"error": "Delete access required"})
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


def current_time_iso():
    return datetime.now(timezone.utc).isoformat()


def get_submissions_repository():
    return SubmissionsRepository()


def get_admin_auth_service():
    return AdminAuthService()


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
        email = body.get("email", "")
        password = body.get("password", "")

        if email:
            return json_response(200, get_admin_auth_service().login(email, password))
        if password == ADMIN_PASSWORD:
            return json_response(200, {"success": True, "token": ADMIN_TOKEN, "role": ROLE_ADMIN})
        if password == DEVELOPER_PASSWORD:
            return json_response(200, {"success": True, "token": DEVELOPER_TOKEN, "role": ROLE_DEVELOPER})
        return json_response(200, {"success": False})
    except Exception as e:
        return json_response(500, {"success": False, "error": str(e)})


def get_authorized_user(event):
    headers = event.get("headers", {})
    auth_header = headers.get("authorization") or headers.get("Authorization")
    if not auth_header:
        return None

    token = auth_header.replace("Bearer ", "")
    if token == ADMIN_TOKEN:
        return {"email": "", "role": ROLE_ADMIN, "token": token}
    if token == DEVELOPER_TOKEN:
        return {"email": "", "role": ROLE_DEVELOPER, "token": token}
    try:
        user = get_admin_auth_service().get_current_user(token)
        role = normalize_role(user.get("role"))
        if not role:
            return None
        return {**user, "role": role, "token": token}
    except Exception as error:
        print(f"Admin auth failed: {error}")
        return None


def is_authorized(event):
    user = get_authorized_user(event)
    return bool(user and can_read(user["role"]))


def is_developer_authorized(event):
    user = get_authorized_user(event)
    return bool(user and can_update_test_mode(user["role"]))


def get_test_mode():
    if is_local_test_mode():
        return json_response(200, {"testMode": True, "localOnly": True})
    return json_response(200, get_submissions_repository().get_runtime_settings())


def update_test_mode(body, user=None):
    if is_local_test_mode():
        return json_response(200, {"testMode": True, "localOnly": True})
    updated_by = (user or {}).get("email") or (user or {}).get("role") or ROLE_DEVELOPER
    updated = get_submissions_repository().set_runtime_test_mode(bool(body.get("enabled")), updated_by)
    return json_response(200, updated)


def request_password_reset(body):
    email = str(body.get("email", "")).strip()
    if not email:
        return json_response(400, {"error": "Email is required"})
    return json_response(200, get_admin_auth_service().request_password_reset(email))


def confirm_password_reset(body):
    email = str(body.get("email", "")).strip()
    code = str(body.get("code", "")).strip()
    password = str(body.get("password", ""))
    if not email or not code or not password:
        return json_response(400, {"error": "Email, code, and password are required"})
    try:
        result = get_admin_auth_service().confirm_password_reset(email, code, password)
        mark_admin_user_password_setup_complete(email)
        return json_response(200, result)
    except ValueError as error:
        return json_response(400, {"error": str(error)})
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code", "")
        if code in {"CodeMismatchException", "ExpiredCodeException"}:
            return json_response(400, {"error": RESET_CODE_ERROR_MESSAGE})
        if code == "InvalidPasswordException":
            return json_response(400, {"error": PASSWORD_POLICY_ERROR_MESSAGE})
        raise


def complete_new_password_challenge(body):
    email = str(body.get("email", "")).strip()
    password = str(body.get("password", ""))
    session = str(body.get("session", "")).strip()
    if not email or not password or not session:
        return json_response(400, {"error": "Email, password, and session are required"})
    try:
        result = get_admin_auth_service().complete_new_password_challenge(email, password, session)
        mark_admin_user_password_setup_complete(email)
        return json_response(200, result)
    except ValueError as error:
        return json_response(400, {"error": str(error)})
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code", "")
        if code in {"InvalidPasswordException"}:
            return json_response(400, {"error": PASSWORD_POLICY_ERROR_MESSAGE})
        if code in {"NotAuthorizedException", "InvalidParameterException"}:
            return json_response(400, {"error": "Invalid or expired setup session. Sign in with the temporary password from the newest setup email."})
        raise


def list_admin_users(current_user):
    users = get_admin_auth_service().list_users()
    users = merge_admin_user_setup_statuses(users)
    if normalize_role(current_user.get("role")) != ROLE_DEVELOPER:
        users = {
            **users,
            "items": [
                user for user in users.get("items", [])
                if normalize_role(user.get("role")) != ROLE_DEVELOPER
            ],
        }
    return json_response(200, users)


def merge_admin_user_setup_statuses(users):
    try:
        setup_statuses = get_submissions_repository().list_admin_user_setup_statuses()
    except Exception as error:
        print(f"Could not load admin user setup statuses: {error}")
        setup_statuses = {}
    return {
        **users,
        "items": [
            merge_admin_user_setup_status(user, setup_statuses)
            for user in users.get("items", [])
        ],
    }


def merge_admin_user_setup_status(user, setup_statuses):
    email = str(user.get("email") or user.get("username") or "").strip().lower()
    setup_status = setup_statuses.get(email, {})
    if not setup_status.get("passwordSetupRequired"):
        return {**user, "status": user.get("status", "")}
    return {
        **user,
        "status": "INVITE_EXPIRED" if admin_user_invite_expired(setup_status) else "RESET_REQUIRED",
    }


def admin_user_invite_expired(setup_status):
    setup_at = setup_status.get("setupRequiredAt") or setup_status.get("updatedAt")
    setup_time = parse_iso_datetime(setup_at)
    now_time = parse_iso_datetime(current_time_iso())
    if not setup_time or not now_time:
        return False
    return now_time - setup_time >= timedelta(days=ADMIN_INVITE_EXPIRATION_DAYS)


def parse_iso_datetime(value):
    if not value:
        return None
    try:
        normalized = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def create_admin_user(body, current_user):
    email = str(body.get("email", "")).strip()
    role = normalize_role(body.get("role"))
    if not email:
        return json_response(400, {"error": "Email is required"})
    if not role:
        return json_response(400, {"error": "Invalid role"})
    if not can_manage_role(current_user["role"], role):
        return json_response(403, {"error": "Cannot manage requested role"})
    try:
        created_user = get_admin_auth_service().create_user(email, role)
        mark_admin_user_password_setup_required(email)
        return json_response(200, {**created_user, "status": "RESET_REQUIRED"})
    except ValueError as error:
        return json_response(400, {"error": str(error)})


def resend_admin_user_invite(email, current_user):
    current_email = str((current_user or {}).get("email", "")).strip().lower()
    target_email = str(email or "").strip().lower()
    if current_email and target_email and current_email == target_email:
        return json_response(403, {"error": "Cannot resend your own invite"})

    auth_service = get_admin_auth_service()
    try:
        users = auth_service.list_users().get("items", [])
        match = next((item for item in users if item.get("email") == email or item.get("username") == email), None)
        target_role = normalize_role((match or {}).get("role"))
        if not target_role:
            return json_response(404, {"error": "User not found"})
        if not can_manage_role(current_user["role"], target_role):
            return json_response(403, {"error": "Cannot manage requested role"})
        resent_user = auth_service.resend_user_invite(email)
        mark_admin_user_password_setup_required(email)
        return json_response(200, {**resent_user, "role": target_role, "status": "RESET_REQUIRED"})
    except ValueError as error:
        return json_response(400, {"error": str(error)})
    except KeyError:
        return json_response(404, {"error": "User not found"})


def mark_admin_user_password_setup_required(email):
    try:
        get_submissions_repository().mark_admin_user_password_setup_required(email)
    except Exception as error:
        print(f"Could not mark admin user password setup required: {error}")


def mark_admin_user_password_setup_complete(email):
    try:
        get_submissions_repository().mark_admin_user_password_setup_complete(email)
    except Exception as error:
        print(f"Could not mark admin user password setup complete: {error}")


def update_admin_user(email, body, current_user):
    current_email = str((current_user or {}).get("email", "")).strip().lower()
    target_email = str(email or "").strip().lower()
    if current_email and target_email and current_email == target_email:
        return json_response(403, {"error": "Cannot update your own account"})

    auth_service = get_admin_auth_service()
    try:
        users = auth_service.list_users().get("items", [])
        match = next((item for item in users if item.get("email") == email or item.get("username") == email), None)
        target_role = normalize_role((match or {}).get("role"))
        if not target_role:
            return json_response(404, {"error": "User not found"})
        if not can_manage_role(current_user["role"], target_role):
            return json_response(403, {"error": "Cannot manage requested role"})

        update = {}
        if "role" in body:
            new_role = normalize_role(body.get("role"))
            if not new_role:
                return json_response(400, {"error": "Invalid role"})
            if not can_manage_role(current_user["role"], new_role):
                return json_response(403, {"error": "Cannot assign requested role"})
            update["role"] = new_role

        if "enabled" in body:
            update["enabled"] = bool(body.get("enabled"))

        if not update:
            return json_response(400, {"error": "No user update provided"})

        return json_response(200, auth_service.update_user(email, **update))
    except ValueError as error:
        return json_response(400, {"error": str(error)})
    except KeyError:
        return json_response(404, {"error": "User not found"})


def delete_admin_user(email, current_user):
    current_email = str((current_user or {}).get("email", "")).strip().lower()
    target_email = str(email or "").strip().lower()
    if current_email and target_email and current_email == target_email:
        return json_response(403, {"error": "Cannot remove your own account"})

    target_role = ""
    try:
        users = get_admin_auth_service().list_users().get("items", [])
        match = next((item for item in users if item.get("email") == email or item.get("username") == email), None)
        target_role = normalize_role((match or {}).get("role"))
    except Exception as error:
        print(f"Could not resolve target user role before delete: {error}")
    if not target_role:
        return json_response(404, {"error": "User not found"})
    if not can_manage_role(current_user["role"], target_role):
        return json_response(403, {"error": "Cannot manage requested role"})
    return json_response(200, {"success": True, **get_admin_auth_service().delete_user(email)})


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
    query = event.get("queryStringParameters") or {}
    limit = parse_submission_limit(query.get("limit"))
    cursor = decode_submission_cursor(query.get("cursor"))
    summary_only = str(query.get("summary", "true")).lower() != "false"
    group = query.get("group")
    search = query.get("search")
    result = repo.list_submissions_page(limit=limit, cursor=cursor, summary_only=summary_only, group=group, search=search)
    last_key = result.get("lastEvaluatedKey")
    total_count = result.get("totalCount")
    if total_count is None:
        total_count = repo.count_submissions(group=group)
    total_pages = max(1, (total_count + limit - 1) // limit)
    return json_response(200, {
        "items": result.get("items", []),
        "nextCursor": encode_submission_cursor(last_key) if last_key else None,
        "pageSize": limit,
        "totalCount": total_count,
        "totalPages": total_pages,
    })


def parse_submission_limit(value):
    try:
        limit = int(value) if value is not None else 50
    except (TypeError, ValueError):
        limit = 50
    return min(max(limit, 1), 100)


def encode_submission_cursor(cursor):
    if not cursor:
        return None
    payload = json.dumps(cursor, separators=(",", ":"), default=json_default).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")


def decode_submission_cursor(cursor):
    if not cursor:
        return None
    try:
        padded = cursor + ("=" * (-len(cursor) % 4))
        return json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
    except Exception:
        return None


def get_submission_detail(submission_id):
    try:
        return json_response(200, get_submissions_repository().get_submission(submission_id))
    except KeyError as e:
        return json_response(404, {"error": str(e)})


def update_submission_admin_fields(submission_id, body, user=None):
    allowed_statuses = {"New", "In Review", "Follow Up", "Complete", "Archived"}
    status = body.get("status") if "status" in body else None
    if status is not None and status not in allowed_statuses:
        return json_response(400, {"error": "Invalid status"})

    try:
        updated = get_submissions_repository().update_submission_admin_fields(
            submission_id=submission_id,
            status=status,
            assigned_to=body.get("assignedTo") if "assignedTo" in body else None,
            notes=body.get("notes") if "notes" in body else None,
            updated_by=(user or {}).get("email") or (user or {}).get("role") or ROLE_ADMIN,
            payment_received=bool(body.get("paymentReceived")) if "paymentReceived" in body else None,
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
