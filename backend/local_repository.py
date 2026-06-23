import json
from decimal import Decimal
from pathlib import Path
from backend.shared.time_utils import pacific_now_iso


def now_iso():
    return pacific_now_iso()


def json_default(value):
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


class LocalSubmissionsRepository:
    SUMMARY_RAW_DATA_KEYS = (
        "formType",
        "eventTitle",
        "eventType",
        "type",
        "subject",
    )

    def __init__(self, path="backend/.local/submissions.json"):
        self.path = Path(path)
        self.holds_path = self.path.with_name(f"{self.path.stem}_payment_holds.json")
        self.settings_path = self.path.with_name(f"{self.path.stem}_settings.json")
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def create_submission(self, record):
        items = self._read()
        items = [item for item in items if item.get("submissionId") != record.get("submissionId")]
        items.append(record)
        self._write(items)

    def create_submission_if_missing(self, record):
        items = self._read()
        if any(item.get("submissionId") == record.get("submissionId") for item in items):
            return False
        items.append(record)
        self._write(items)
        return True

    def list_submissions(self, limit=None):
        items = sorted(
            self._read(),
            key=lambda item: item.get("submittedAt") or item.get("createdAt") or "",
            reverse=True,
        )
        return {"items": items[:limit] if limit is not None else items}

    def list_submissions_page(self, limit=50, cursor=None, summary_only=True, group=None, search=None):
        items = sorted(
            self._read(),
            key=lambda item: item.get("submittedAt") or item.get("createdAt") or "",
            reverse=True,
        )
        group = group or (cursor.get("group") if isinstance(cursor, dict) else None)
        search = search if search is not None else (cursor.get("search") if isinstance(cursor, dict) else None)
        if group and group != "all":
            items = [item for item in items if self.submission_matches_group(item, group)]
        if search and str(search).strip():
            normalized_query = str(search).strip().lower()
            items = [item for item in items if normalized_query in self._submission_search_text(item)]
        total_count = len(items)
        offset = self._cursor_offset(cursor)
        page = items[offset:offset + limit]
        if summary_only:
            page = [self._summarize_submission(item) for item in page]
        next_offset = offset + len(page)
        last_key = {"offset": next_offset, "group": group, "search": search} if next_offset < len(items) else None
        return {"items": page, "lastEvaluatedKey": last_key, "totalCount": total_count}

    def count_submissions(self, group=None):
        if not group or group == "all":
            return len(self._read())
        return sum(1 for item in self._read() if self.submission_matches_group(item, group))

    def submission_matches_group(self, submission, group):
        if not group or group == "all":
            return True

        text = self._submission_group_text(submission)
        if group == "vendor":
            return "vendor" in text or "vendorapplication" in text
        if group == "artist":
            return "artist" in text or "artistsignup" in text
        if group == "sponsor":
            return self._is_freedom_club_submission(submission)
        if group == "motorShow":
            return "motor show" in text or "motorshow" in text or "car show" in text
        if group == "parade":
            return "parade" in text or "paradeentry" in text or "paradecar" in text or "paradevip" in text
        if group == "volunteer":
            return "volunteer" in text
        if group == "specialEvents":
            return self._is_sponsorship_submission(submission)
        return True

    def _is_sponsorship_submission(self, submission):
        text = self._submission_group_text(submission)
        return "sponsor" in text or "sponsorship" in text

    def _is_freedom_club_submission(self, submission):
        if self._is_sponsorship_submission(submission):
            return False

        excluded_groups = ("vendor", "artist", "motorShow", "parade", "volunteer")
        if any(self.submission_matches_group(submission, group) for group in excluded_groups):
            return False

        raw_data = submission.get("rawData") or {}
        return bool(
            raw_data.get("eventTitle")
            or raw_data.get("eventType")
            or raw_data.get("pricing")
            or raw_data.get("addOns")
            or raw_data.get("players")
            or raw_data.get("teamMembers")
            or submission.get("paymentProvider") in {"stripe", "paypal"}
        )

    def _submission_group_text(self, submission):
        raw_data = submission.get("rawData") or {}
        return " ".join(
            str(value).lower()
            for value in (
                submission.get("source"),
                submission.get("submissionTitle"),
                raw_data.get("formType"),
                raw_data.get("eventTitle"),
                raw_data.get("eventType"),
                raw_data.get("type"),
            )
            if value
        )

    def _submission_search_text(self, submission):
        raw_data = submission.get("rawData") or {}
        raw_values = raw_data.values() if isinstance(raw_data, dict) else []
        values = [
            submission.get("submissionTitle"),
            submission.get("name"),
            submission.get("email"),
            submission.get("phone"),
            submission.get("status"),
            submission.get("assignedTo"),
            submission.get("notes"),
            submission.get("source"),
            *raw_values,
        ]
        return " ".join(str(value).lower() for value in values if value is not None)

    def _cursor_offset(self, cursor):
        if not isinstance(cursor, dict):
            return 0
        try:
            return max(int(cursor.get("offset", 0)), 0)
        except (TypeError, ValueError):
            return 0

    def get_submission(self, submission_id):
        for item in self._read():
            if item.get("submissionId") == submission_id:
                return item
        raise KeyError(f"Submission not found: {submission_id}")

    def delete_submission(self, submission_id):
        items = self._read()
        for index, item in enumerate(items):
            if item.get("submissionId") == submission_id:
                items.pop(index)
                self._write(items)
                return item
        raise KeyError(f"Submission not found: {submission_id}")

    def _summarize_submission(self, submission):
        summary = {
            key: value
            for key, value in submission.items()
            if key not in {"pk", "sk", "recordType", "rawData"}
        }
        raw_data = submission.get("rawData")
        if isinstance(raw_data, dict):
            raw_summary = {
                key: raw_data[key]
                for key in self.SUMMARY_RAW_DATA_KEYS
                if key in raw_data
            }
            if raw_summary:
                summary["rawData"] = raw_summary
        return summary

    def update_submission_admin_fields(
        self,
        submission_id,
        status=None,
        assigned_to=None,
        notes=None,
        updated_by=None,
        payment_received=None,
    ):
        items = self._read()
        for index, item in enumerate(items):
            if item.get("submissionId") == submission_id:
                updated = {
                    **item,
                    "updatedAt": now_iso(),
                    "updatedBy": updated_by,
                }
                if status is not None:
                    updated["status"] = status
                if assigned_to is not None:
                    updated["assignedTo"] = assigned_to
                if notes is not None:
                    updated["notes"] = notes
                if payment_received is not None:
                    updated["paymentReceived"] = bool(payment_received)
                items[index] = updated
                self._write(items)
                return updated
        raise KeyError(f"Submission {submission_id} not found")

    def save_payment_hold(self, submission_id, payload):
        holds = self._read_holds()
        holds[submission_id] = payload
        self._write_holds(holds)

    def get_payment_hold(self, submission_id):
        return self._read_holds().get(submission_id)

    def claim_payment_processing(self, submission_id, provider, metadata=None):
        return True

    def release_payment_processing(self, submission_id):
        return None

    def complete_payment_processing(self, submission_id, provider, metadata=None):
        return {"submissionId": submission_id, "provider": provider, **(metadata or {})}

    def get_runtime_settings(self):
        settings = self._read_settings()
        return {
            "testMode": bool(settings.get("testMode", False)),
            "updatedBy": settings.get("updatedBy", ""),
            "updatedAt": settings.get("updatedAt", ""),
        }

    def set_runtime_test_mode(self, enabled, updated_by):
        settings = self._read_settings()
        settings.update({
            "testMode": bool(enabled),
            "updatedBy": updated_by,
            "updatedAt": now_iso(),
        })
        self._write_settings(settings)
        return settings

    def list_admin_user_setup_statuses(self):
        settings = self._read_settings()
        statuses = settings.get("adminUserSetupStatuses", {})
        return statuses if isinstance(statuses, dict) else {}

    def mark_admin_user_password_setup_required(self, email):
        return self._set_admin_user_password_setup_required(email, True)

    def mark_admin_user_password_setup_complete(self, email):
        return self._set_admin_user_password_setup_required(email, False)

    def _set_admin_user_password_setup_required(self, email, required):
        normalized_email = str(email or "").strip().lower()
        settings = self._read_settings()
        statuses = settings.get("adminUserSetupStatuses", {})
        if not isinstance(statuses, dict):
            statuses = {}
        statuses[normalized_email] = {"passwordSetupRequired": bool(required)}
        settings["adminUserSetupStatuses"] = statuses
        self._write_settings(settings)
        return {"email": normalized_email, "passwordSetupRequired": bool(required)}

    def _read(self):
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text() or "[]")

    def _write(self, items):
        self.path.write_text(json.dumps(items, indent=2, sort_keys=True, default=json_default))

    def _read_holds(self):
        if not self.holds_path.exists():
            return {}
        return json.loads(self.holds_path.read_text() or "{}")

    def _write_holds(self, holds):
        self.holds_path.write_text(json.dumps(holds, indent=2, sort_keys=True, default=json_default))

    def _read_settings(self):
        if not self.settings_path.exists():
            return {}
        return json.loads(self.settings_path.read_text() or "{}")

    def _write_settings(self, settings):
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        self.settings_path.write_text(json.dumps(settings, indent=2, sort_keys=True, default=json_default))
