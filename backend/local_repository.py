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

    def list_submissions(self, limit=100):
        items = sorted(
            self._read(),
            key=lambda item: item.get("submittedAt") or item.get("createdAt") or "",
            reverse=True,
        )
        return {"items": items[:limit]}

    def delete_submission(self, submission_id):
        items = self._read()
        for index, item in enumerate(items):
            if item.get("submissionId") == submission_id:
                items.pop(index)
                self._write(items)
                return item
        raise KeyError(f"Submission not found: {submission_id}")

    def update_submission_admin_fields(self, submission_id, status, assigned_to, notes, updated_by):
        items = self._read()
        for index, item in enumerate(items):
            if item.get("submissionId") == submission_id:
                updated = {
                    **item,
                    "status": status,
                    "assignedTo": assigned_to,
                    "notes": notes,
                    "updatedAt": now_iso(),
                    "updatedBy": updated_by,
                }
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
        if not self.settings_path.exists():
            return {"testMode": False, "updatedBy": "", "updatedAt": ""}
        settings = json.loads(self.settings_path.read_text() or "{}")
        return {
            "testMode": bool(settings.get("testMode", False)),
            "updatedBy": settings.get("updatedBy", ""),
            "updatedAt": settings.get("updatedAt", ""),
        }

    def set_runtime_test_mode(self, enabled, updated_by):
        settings = {
            "testMode": bool(enabled),
            "updatedBy": updated_by,
            "updatedAt": now_iso(),
        }
        self.settings_path.write_text(json.dumps(settings, indent=2, sort_keys=True))
        return settings

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
