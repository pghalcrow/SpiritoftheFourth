import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def now_iso():
    return datetime.now(ZoneInfo("America/Los_Angeles")).isoformat(timespec="seconds")


class LocalSubmissionsRepository:
    def __init__(self, path="backend/.local/submissions.json"):
        self.path = Path(path)
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
        return None

    def get_payment_hold(self, submission_id):
        return None

    def claim_payment_processing(self, submission_id, provider, metadata=None):
        return True

    def release_payment_processing(self, submission_id):
        return None

    def complete_payment_processing(self, submission_id, provider, metadata=None):
        return {"submissionId": submission_id, "provider": provider, **(metadata or {})}

    def _read(self):
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text() or "[]")

    def _write(self, items):
        self.path.write_text(json.dumps(items, indent=2, sort_keys=True))
