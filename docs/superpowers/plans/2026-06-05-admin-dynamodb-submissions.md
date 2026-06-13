# Admin DynamoDB Submissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google Sheet submission tracking with DynamoDB-backed storage and an admin spreadsheet-style submissions view.

**Architecture:** Create tracked backend Lambda source under `backend/`, centered on a shared DynamoDB submissions repository. The existing mail/order Lambdas write submissions, payment holds, and processed-payment markers to DynamoDB; the existing admin `events_service` Lambda exposes authorized submissions endpoints; the Angular `/admin` page adds an `Events`/`Submissions` section switcher.

**Tech Stack:** AWS Lambda Python, boto3 DynamoDB, AWS CLI, Angular 15, Jasmine/Karma, Google Sheets import through `gspread`, SES email path already in place.

---

## Files And Responsibilities

- Create `backend/shared/submissions_repository.py`: DynamoDB repository for submissions, payment holds, processed-payment markers, list/update operations, and sheet-import idempotency.
- Create `backend/shared/submissions_mapping.py`: Pure mapping helpers that normalize live form/payment data and imported sheet rows into repository records.
- Create `backend/tests/test_submissions_repository.py`: Unit tests for repository behavior using fake in-memory DynamoDB table objects.
- Create `backend/tests/test_submissions_mapping.py`: Unit tests for worksheet/live payload mapping.
- Create `backend/lambdas/events_service/lambda_function.py`: Tracked copy of the admin CMS Lambda, extended with submissions routes.
- Create `backend/lambdas/create_order/`: Tracked copy of order Lambda source, replacing Google Sheet hold/processed/final writes with repository calls.
- Create `backend/lambdas/sotf_mailer/`: Tracked copy of mailer Lambda source, replacing Google Sheet final writes with repository calls.
- Create `backend/scripts/create_dynamodb_tables.sh`: Creates dev/prod DynamoDB tables.
- Create `backend/scripts/import_google_sheet.py`: Imports current Google Sheet tabs into DynamoDB idempotently.
- Create `backend/scripts/package_lambda.sh`: Packages one tracked Lambda source folder with shared modules.
- Create `backend/scripts/deploy_lambdas.sh`: Deploys tracked Lambda packages to dev/prod Lambda functions.
- Modify `src/environments/environment.ts`: Add admin submissions route config.
- Modify `src/environments/environment.prod.ts`: Add admin submissions route config.
- Modify `src/app/services/cms.service.ts`: Add submission interfaces and API methods.
- Modify `src/app/services/cms.service.spec.ts`: Add HTTP tests for submission API methods.
- Modify `src/app/pages/admin/admin.component.ts`: Add admin section state, submissions loading, filters, detail selection, and admin-field update behavior.
- Modify `src/app/pages/admin/admin.component.html`: Add section switcher and spreadsheet-style submissions table/detail panel.
- Modify `src/app/pages/admin/admin.component.css`: Add restrained admin table/detail styling matching existing admin look.
- Modify `src/app/pages/admin/admin.component.spec.ts`: Add tests for section switching, row rendering, detail opening, and admin-field updates.
- Modify `docs/superpowers/specs/2026-06-05-admin-dynamodb-submissions-design.md` only if implementation discovers a necessary spec correction.

## Task 1: Add Backend Test Harness And Mapping Helpers

**Files:**
- Create: `backend/shared/submissions_mapping.py`
- Create: `backend/tests/test_submissions_mapping.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/shared/__init__.py`

- [ ] **Step 1: Create failing mapping tests**

Create `backend/tests/test_submissions_mapping.py`:

```python
from backend.shared.submissions_mapping import (
    map_sheet_submission_row,
    map_processed_payment_row,
    map_payment_hold_row,
    map_live_submission,
)


def test_maps_sheet1_row_to_submission_record():
    record = map_sheet_submission_row(
        worksheet="Sheet1",
        row_number=2,
        headers=["Form", "SubmittedDate", "Name", "Email", "Phone"],
        values=["Car Show Entry Request", "2024-03-26 16:00", "George Rumble", "46.55george@cox.net", "760-703-4833"],
    )

    assert record["recordType"] == "submission"
    assert record["pk"] == "SUBMISSION"
    assert record["source"] == "Sheet1"
    assert record["submissionTitle"] == "Car Show Entry Request"
    assert record["submittedAt"] == "2024-03-26T16:00:00-07:00"
    assert record["name"] == "George Rumble"
    assert record["email"] == "46.55george@cox.net"
    assert record["phone"] == "760-703-4833"
    assert record["status"] == "New"
    assert record["rawData"]["worksheet"] == "Sheet1"
    assert record["rawData"]["rowNumber"] == 2


def test_maps_event_submission_row_without_header_difference():
    record = map_sheet_submission_row(
        worksheet="Event Submissions",
        row_number=8,
        headers=["Submissions", "Date", "Name", "Email", "Phone"],
        values=["Golf Fundraiser Order", "2026-03-16 21:12", "Resa Coopat", "resacoopat15@gmail.com", "6194176739"],
    )

    assert record["submissionTitle"] == "Golf Fundraiser Order"
    assert record["submittedAt"] == "2026-03-16T21:12:00-07:00"
    assert record["source"] == "Event Submissions"


def test_maps_payment_hold_row():
    record = map_payment_hold_row(
        worksheet="Event Hold",
        row_number=2,
        submission_id="abc123",
        payload_json='{"type":"golfEvent","formData":{"fullName":"Pat","email":"pat@example.com"}}',
    )

    assert record["recordType"] == "payment_hold"
    assert record["pk"] == "PAYMENT_HOLD"
    assert record["sk"] == "abc123"
    assert record["submissionId"] == "abc123"
    assert record["payload"]["type"] == "golfEvent"
    assert record["rawData"]["worksheet"] == "Event Hold"


def test_maps_processed_payment_row():
    record = map_processed_payment_row("Processed Submissions", 4, ["sub123", "2026-03-25 20:36"])

    assert record["recordType"] == "processed_payment"
    assert record["pk"] == "PROCESSED_PAYMENT"
    assert record["sk"] == "sub123"
    assert record["submissionId"] == "sub123"
    assert record["processedAt"] == "2026-03-25T20:36:00-07:00"


def test_maps_live_submission_with_payment_fields():
    record = map_live_submission(
        submission_id="live-1",
        title="New Vendor Application Submission",
        name="Vendor Contact",
        email="vendor@example.com",
        phone="555-1212",
        source="vendor",
        raw_data={"vendorType": "Business", "grandTotal": 125},
        payment_status="paid",
        payment_provider="stripe",
        amount=125,
        currency="USD",
    )

    assert record["recordType"] == "submission"
    assert record["submissionId"] == "live-1"
    assert record["paymentStatus"] == "paid"
    assert record["paymentProvider"] == "stripe"
    assert record["amount"] == 125
    assert record["currency"] == "USD"
```

- [ ] **Step 2: Run mapping tests and verify they fail**

Run:

```bash
python3 -m unittest backend.tests.test_submissions_mapping -v
```

Expected: FAIL with `ModuleNotFoundError` for `backend.shared.submissions_mapping`.

- [ ] **Step 3: Implement mapping helpers**

Create `backend/shared/__init__.py` and `backend/tests/__init__.py` as empty files.

Create `backend/shared/submissions_mapping.py`:

```python
from __future__ import annotations

from datetime import datetime
import hashlib
import json
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")


def now_iso() -> str:
    return datetime.now(PACIFIC).isoformat(timespec="seconds")


def parse_sheet_datetime(value: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        return now_iso()
    for fmt in ("%Y-%m-%d %H:%M", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M"):
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=PACIFIC).isoformat(timespec="seconds")
        except ValueError:
            continue
    return cleaned


def stable_submission_id(source: str, row_number: int, values: list[str]) -> str:
    digest = hashlib.sha256(json.dumps([source, row_number, values], sort_keys=True).encode("utf-8")).hexdigest()
    return f"import-{source.lower().replace(' ', '-')}-{row_number}-{digest[:12]}"


def build_submission_sk(submitted_at: str, submission_id: str) -> str:
    return f"{submitted_at}#{submission_id}"


def map_sheet_submission_row(worksheet: str, row_number: int, headers: list[str], values: list[str]) -> dict:
    row = {headers[i]: values[i] if i < len(values) else "" for i in range(len(headers))}
    title = row.get("Form") or row.get("Submissions") or (values[0] if values else "")
    submitted_at = parse_sheet_datetime(row.get("SubmittedDate") or row.get("Date") or (values[1] if len(values) > 1 else ""))
    submission_id = stable_submission_id(worksheet, row_number, values)
    created_at = now_iso()
    return {
        "pk": "SUBMISSION",
        "sk": build_submission_sk(submitted_at, submission_id),
        "recordType": "submission",
        "submissionId": submission_id,
        "source": worksheet,
        "submissionTitle": title,
        "submittedAt": submitted_at,
        "name": row.get("Name", values[2] if len(values) > 2 else ""),
        "email": row.get("Email", values[3] if len(values) > 3 else ""),
        "phone": row.get("Phone", values[4] if len(values) > 4 else ""),
        "paymentStatus": "unknown",
        "paymentProvider": "unknown",
        "amount": None,
        "currency": "USD",
        "rawData": {"worksheet": worksheet, "rowNumber": row_number, "headers": headers, "values": values},
        "status": "New",
        "assignedTo": "",
        "notes": "",
        "createdAt": created_at,
        "updatedAt": created_at,
        "updatedBy": "import",
    }


def map_payment_hold_row(worksheet: str, row_number: int, submission_id: str, payload_json: str) -> dict:
    payload = json.loads(payload_json or "{}")
    created_at = now_iso()
    return {
        "pk": "PAYMENT_HOLD",
        "sk": submission_id,
        "recordType": "payment_hold",
        "submissionId": submission_id,
        "payload": payload,
        "createdAt": created_at,
        "rawData": {"worksheet": worksheet, "rowNumber": row_number},
    }


def map_processed_payment_row(worksheet: str, row_number: int, values: list[str]) -> dict:
    submission_id = values[0]
    processed_at = parse_sheet_datetime(values[1] if len(values) > 1 else "")
    return {
        "pk": "PROCESSED_PAYMENT",
        "sk": submission_id,
        "recordType": "processed_payment",
        "submissionId": submission_id,
        "provider": "unknown",
        "providerSessionId": "",
        "processedAt": processed_at,
        "rawData": {"worksheet": worksheet, "rowNumber": row_number, "values": values},
    }


def map_live_submission(
    submission_id: str,
    title: str,
    name: str,
    email: str,
    phone: str,
    source: str,
    raw_data: dict,
    payment_status: str = "none",
    payment_provider: str = "none",
    amount=None,
    currency: str = "USD",
) -> dict:
    submitted_at = now_iso()
    return {
        "pk": "SUBMISSION",
        "sk": build_submission_sk(submitted_at, submission_id),
        "recordType": "submission",
        "submissionId": submission_id,
        "source": source,
        "submissionTitle": title,
        "submittedAt": submitted_at,
        "name": name or "",
        "email": email or "",
        "phone": phone or "",
        "paymentStatus": payment_status,
        "paymentProvider": payment_provider,
        "amount": amount,
        "currency": currency,
        "rawData": raw_data or {},
        "status": "New",
        "assignedTo": "",
        "notes": "",
        "createdAt": submitted_at,
        "updatedAt": submitted_at,
        "updatedBy": "system",
    }
```

- [ ] **Step 4: Run mapping tests and verify they pass**

Run:

```bash
python3 -m unittest backend.tests.test_submissions_mapping -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/shared backend/tests/test_submissions_mapping.py
git commit -m "Add submission mapping helpers"
```

## Task 2: Add DynamoDB Repository

**Files:**
- Create: `backend/shared/submissions_repository.py`
- Create: `backend/tests/test_submissions_repository.py`

- [ ] **Step 1: Create failing repository tests**

Create `backend/tests/test_submissions_repository.py`:

```python
import unittest
from unittest.mock import patch

from backend.shared.submissions_repository import SubmissionsRepository


class FakeTable:
    def __init__(self):
        self.items = {}

    def put_item(self, **kwargs):
        item = kwargs["Item"]
        key = (item["pk"], item["sk"])
        condition = kwargs.get("ConditionExpression")
        if condition and key in self.items:
            raise Exception("ConditionalCheckFailedException")
        self.items[key] = item
        return {"ResponseMetadata": {"HTTPStatusCode": 200}}

    def get_item(self, **kwargs):
        key = (kwargs["Key"]["pk"], kwargs["Key"]["sk"])
        item = self.items.get(key)
        return {"Item": item} if item else {}

    def update_item(self, **kwargs):
        key = (kwargs["Key"]["pk"], kwargs["Key"]["sk"])
        item = self.items[key]
        names = kwargs["ExpressionAttributeNames"]
        values = kwargs["ExpressionAttributeValues"]
        for placeholder, field_name in names.items():
            value_key = ":" + placeholder.lstrip("#")
            if value_key in values:
                item[field_name] = values[value_key]
        return {"Attributes": item}

    def query(self, **kwargs):
        pk_value = kwargs["ExpressionAttributeValues"][":pk"]
        rows = [item for (pk, _), item in self.items.items() if pk == pk_value]
        rows.sort(key=lambda row: row["sk"], reverse=kwargs.get("ScanIndexForward") is False)
        limit = kwargs.get("Limit")
        return {"Items": rows[:limit] if limit else rows}


class RepositoryTests(unittest.TestCase):
    def setUp(self):
        self.table = FakeTable()
        self.repo = SubmissionsRepository(table=self.table)

    def test_create_submission_and_list(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
        })

        result = self.repo.list_submissions(limit=10)

        self.assertEqual(result["items"][0]["submissionId"], "s1")
        self.assertEqual(result["items"][0]["submissionTitle"], "Volunteer")

    def test_payment_hold_round_trip(self):
        self.repo.save_payment_hold("hold-1", {"formData": {"fullName": "Pat"}})

        payload = self.repo.get_payment_hold("hold-1")

        self.assertEqual(payload["formData"]["fullName"], "Pat")

    def test_processed_payment_idempotency(self):
        self.assertFalse(self.repo.is_processed_payment("p1"))
        self.assertTrue(self.repo.mark_processed_payment("p1", "stripe", {"sessionId": "cs_123"}))
        self.assertTrue(self.repo.is_processed_payment("p1"))
        self.assertFalse(self.repo.mark_processed_payment("p1", "stripe", {"sessionId": "cs_123"}))

    def test_update_admin_fields(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
        })

        updated = self.repo.update_submission_admin_fields("s1", "Complete", "Patrick", "Done", "admin")

        self.assertEqual(updated["status"], "Complete")
        self.assertEqual(updated["assignedTo"], "Patrick")
        self.assertEqual(updated["notes"], "Done")
        self.assertEqual(updated["updatedBy"], "admin")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run repository tests and verify they fail**

Run:

```bash
python3 -m unittest backend.tests.test_submissions_repository -v
```

Expected: FAIL with `ModuleNotFoundError` for `backend.shared.submissions_repository`.

- [ ] **Step 3: Implement repository**

Create `backend/shared/submissions_repository.py`:

```python
from __future__ import annotations

from datetime import datetime
import os
from zoneinfo import ZoneInfo

import boto3
from botocore.exceptions import ClientError

PACIFIC = ZoneInfo("America/Los_Angeles")


def _now_iso() -> str:
    return datetime.now(PACIFIC).isoformat(timespec="seconds")


class SubmissionsRepository:
    def __init__(self, table=None, table_name: str | None = None):
        if table is not None:
            self.table = table
        else:
            resolved_table = table_name or os.environ["SUBMISSIONS_TABLE"]
            self.table = boto3.resource("dynamodb").Table(resolved_table)

    def create_submission(self, record: dict) -> dict:
        self.table.put_item(Item=record)
        return record

    def save_payment_hold(self, submission_id: str, payload: dict) -> dict:
        created_at = _now_iso()
        record = {
            "pk": "PAYMENT_HOLD",
            "sk": submission_id,
            "recordType": "payment_hold",
            "submissionId": submission_id,
            "payload": payload,
            "createdAt": created_at,
        }
        self.table.put_item(Item=record)
        return record

    def get_payment_hold(self, submission_id: str) -> dict:
        response = self.table.get_item(Key={"pk": "PAYMENT_HOLD", "sk": submission_id})
        return response.get("Item", {}).get("payload", {})

    def is_processed_payment(self, submission_id: str) -> bool:
        response = self.table.get_item(Key={"pk": "PROCESSED_PAYMENT", "sk": submission_id})
        return "Item" in response

    def mark_processed_payment(self, submission_id: str, provider: str, metadata: dict | None = None) -> bool:
        record = {
            "pk": "PROCESSED_PAYMENT",
            "sk": submission_id,
            "recordType": "processed_payment",
            "submissionId": submission_id,
            "provider": provider,
            "providerSessionId": (metadata or {}).get("sessionId", ""),
            "processedAt": _now_iso(),
            "metadata": metadata or {},
        }
        try:
            self.table.put_item(Item=record, ConditionExpression="attribute_not_exists(pk)")
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return False
            raise
        except Exception as exc:
            if "ConditionalCheckFailedException" in str(exc):
                return False
            raise

    def list_submissions(self, limit: int = 100) -> dict:
        response = self.table.query(
            KeyConditionExpression="pk = :pk",
            ExpressionAttributeValues={":pk": "SUBMISSION"},
            ScanIndexForward=False,
            Limit=limit,
        )
        return {"items": response.get("Items", [])}

    def update_submission_admin_fields(
        self,
        submission_id: str,
        status: str,
        assigned_to: str,
        notes: str,
        updated_by: str,
    ) -> dict:
        submission = self._find_submission_by_id(submission_id)
        if not submission:
            raise KeyError(f"Submission not found: {submission_id}")
        response = self.table.update_item(
            Key={"pk": submission["pk"], "sk": submission["sk"]},
            UpdateExpression="SET #status = :status, #assignedTo = :assignedTo, #notes = :notes, #updatedAt = :updatedAt, #updatedBy = :updatedBy",
            ExpressionAttributeNames={
                "#status": "status",
                "#assignedTo": "assignedTo",
                "#notes": "notes",
                "#updatedAt": "updatedAt",
                "#updatedBy": "updatedBy",
            },
            ExpressionAttributeValues={
                ":status": status,
                ":assignedTo": assigned_to,
                ":notes": notes,
                ":updatedAt": _now_iso(),
                ":updatedBy": updated_by,
            },
            ReturnValues="ALL_NEW",
        )
        return response["Attributes"]

    def _find_submission_by_id(self, submission_id: str) -> dict | None:
        response = self.table.query(
            KeyConditionExpression="pk = :pk",
            ExpressionAttributeValues={":pk": "SUBMISSION"},
        )
        for item in response.get("Items", []):
            if item.get("submissionId") == submission_id:
                return item
        return None
```

- [ ] **Step 4: Run repository tests and verify they pass**

Run:

```bash
python3 -m unittest backend.tests.test_submissions_repository -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/shared/submissions_repository.py backend/tests/test_submissions_repository.py
git commit -m "Add DynamoDB submissions repository"
```

## Task 3: Create DynamoDB Tables And IAM Update Script

**Files:**
- Create: `backend/scripts/create_dynamodb_tables.sh`
- Create: `backend/scripts/print_dynamodb_iam_policy.py`
- Modify: `docs/superpowers/specs/2026-06-05-admin-dynamodb-submissions-design.md` only if table names change during implementation.

- [ ] **Step 1: Create table creation script**

Create `backend/scripts/create_dynamodb_tables.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"

create_table() {
  local table_name="$1"
  if aws dynamodb describe-table --region "$REGION" --table-name "$table_name" >/dev/null 2>&1; then
    echo "Table already exists: $table_name"
    return
  fi

  aws dynamodb create-table \
    --region "$REGION" \
    --table-name "$table_name" \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST

  aws dynamodb wait table-exists --region "$REGION" --table-name "$table_name"
  echo "Created table: $table_name"
}

create_table "sotf-submissions-dev"
create_table "sotf-submissions"
```

- [ ] **Step 2: Create IAM policy printer**

Create `backend/scripts/print_dynamodb_iam_policy.py`:

```python
import json

ACCOUNT_ID = "470065668628"
REGION = "us-west-2"
TABLES = ["sotf-submissions-dev", "sotf-submissions"]

policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:UpdateItem",
                "dynamodb:Query",
            ],
            "Resource": [
                f"arn:aws:dynamodb:{REGION}:{ACCOUNT_ID}:table/{table_name}"
                for table_name in TABLES
            ],
        }
    ],
}

print(json.dumps(policy, indent=2))
```

- [ ] **Step 3: Make scripts executable**

Run:

```bash
chmod +x backend/scripts/create_dynamodb_tables.sh
```

Expected: no output.

- [ ] **Step 4: Create the tables**

Run:

```bash
AWS_REGION=us-west-2 backend/scripts/create_dynamodb_tables.sh
```

Expected: output says both tables already exist or were created.

- [ ] **Step 5: Capture IAM policy for Lambda roles**

Run:

```bash
python3 backend/scripts/print_dynamodb_iam_policy.py
```

Expected: JSON policy with `sotf-submissions-dev` and `sotf-submissions` table ARNs.

- [ ] **Step 6: Attach DynamoDB permissions to Lambda roles**

Run these role-policy updates:

```bash
python3 backend/scripts/print_dynamodb_iam_policy.py > /tmp/sotf-dynamodb-policy.json
aws iam put-role-policy --role-name events_service-role-dev --policy-name sotf-dynamodb-submissions --policy-document file:///tmp/sotf-dynamodb-policy.json
aws iam put-role-policy --role-name events_service-role-wx0mx6xx --policy-name sotf-dynamodb-submissions --policy-document file:///tmp/sotf-dynamodb-policy.json
aws iam put-role-policy --role-name dev_sotf_mailer_role --policy-name sotf-dynamodb-submissions --policy-document file:///tmp/sotf-dynamodb-policy.json
aws iam put-role-policy --role-name sotf_mailer-role-4kntmewb --policy-name sotf-dynamodb-submissions --policy-document file:///tmp/sotf-dynamodb-policy.json
```

For `create_order` and `dev_create_order`, first get the role names:

```bash
aws lambda get-function-configuration --function-name create_order --query 'Role' --output text
aws lambda get-function-configuration --function-name dev_create_order --query 'Role' --output text
```

Then run `aws iam put-role-policy` with the role names shown by those commands.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/create_dynamodb_tables.sh backend/scripts/print_dynamodb_iam_policy.py
git commit -m "Add DynamoDB table setup scripts"
```

## Task 4: Add Tracked Admin Lambda With Submissions Routes

**Files:**
- Create: `backend/lambdas/events_service/lambda_function.py`
- Create: `backend/tests/test_events_service_submissions.py`

- [ ] **Step 1: Copy current events service source into tracked backend**

Run:

```bash
mkdir -p backend/lambdas/events_service
cp aws-export/lambda/events_service/lambda_function.py backend/lambdas/events_service/lambda_function.py
```

Expected: tracked file exists at `backend/lambdas/events_service/lambda_function.py`.

- [ ] **Step 2: Create failing admin route tests**

Create `backend/tests/test_events_service_submissions.py`:

```python
import json
import unittest
from unittest.mock import patch

import backend.lambdas.events_service.lambda_function as events_service


def make_event(method, path, body=None, token="cms-admin-token"):
    return {
        "requestContext": {"http": {"method": method}},
        "rawPath": path,
        "headers": {"Authorization": f"Bearer {token}"} if token else {},
        "body": json.dumps(body or {}),
    }


class FakeRepo:
    def list_submissions(self, limit=100):
        return {"items": [{"submissionId": "s1", "submissionTitle": "Volunteer", "status": "New"}]}

    def update_submission_admin_fields(self, submission_id, status, assigned_to, notes, updated_by):
        return {
            "submissionId": submission_id,
            "status": status,
            "assignedTo": assigned_to,
            "notes": notes,
            "updatedBy": updated_by,
        }


class EventsServiceSubmissionRoutesTests(unittest.TestCase):
    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_authorized_admin_can_list_submissions(self, _repo):
        response = events_service.lambda_handler(make_event("GET", "/admin/submissions"), None)

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["items"][0]["submissionId"], "s1")

    def test_unauthorized_admin_cannot_list_submissions(self):
        response = events_service.lambda_handler(make_event("GET", "/admin/submissions", token=None), None)

        self.assertEqual(response["statusCode"], 401)

    @patch.object(events_service, "get_submissions_repository", return_value=FakeRepo())
    def test_authorized_admin_can_patch_submission_admin_fields(self, _repo):
        response = events_service.lambda_handler(
            make_event(
                "PATCH",
                "/admin/submissions/s1",
                {"status": "Complete", "assignedTo": "Patrick", "notes": "Verified"},
            ),
            None,
        )

        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"])
        self.assertEqual(body["submissionId"], "s1")
        self.assertEqual(body["status"], "Complete")
        self.assertEqual(body["assignedTo"], "Patrick")
        self.assertEqual(body["notes"], "Verified")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run admin route tests and verify they fail**

Run:

```bash
python3 -m unittest backend.tests.test_events_service_submissions -v
```

Expected: FAIL because `/admin/submissions` routes are not implemented.

- [ ] **Step 4: Implement submissions routes**

Patch `backend/lambdas/events_service/lambda_function.py`:

```python
from backend.shared.submissions_repository import SubmissionsRepository


def get_submissions_repository():
    return SubmissionsRepository()
```

Add route handling inside `lambda_handler` before the final `405`:

```python
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
```

Add helper functions:

```python
def json_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def list_submissions(event):
    limit = 100
    repo = get_submissions_repository()
    return json_response(200, repo.list_submissions(limit=limit))


def update_submission_admin_fields(submission_id, body):
    allowed_statuses = {"New", "In Review", "Follow Up", "Complete", "Archived"}
    status = body.get("status", "New")
    if status not in allowed_statuses:
        return json_response(400, {"error": "Invalid status"})
    updated = get_submissions_repository().update_submission_admin_fields(
        submission_id=submission_id,
        status=status,
        assigned_to=body.get("assignedTo", ""),
        notes=body.get("notes", ""),
        updated_by="admin",
    )
    return json_response(200, updated)
```

- [ ] **Step 5: Run admin route tests**

Run:

```bash
python3 -m unittest backend.tests.test_events_service_submissions -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/lambdas/events_service/lambda_function.py backend/tests/test_events_service_submissions.py
git commit -m "Add admin submissions API routes"
```

## Task 5: Replace Google Sheet Writes In Order Lambda Source

**Files:**
- Create: `backend/lambdas/create_order/` from current `aws-export/lambda/create_order/`
- Modify: `backend/lambdas/create_order/app.py`
- Test: existing manual Stripe/PayPal test checklist plus targeted unit import smoke test.

- [ ] **Step 1: Copy current order Lambda into tracked backend excluding vendored packages**

Run:

```bash
mkdir -p backend/lambdas/create_order
rsync -a \
  --exclude 'botocore' \
  --exclude 'boto3' \
  --exclude 'gspread' \
  --exclude 'google' \
  --exclude 'cryptography' \
  --exclude 'stripe' \
  --exclude 'requests' \
  --exclude '*.dist-info' \
  aws-export/lambda/create_order/ backend/lambdas/create_order/
```

Expected: `backend/lambdas/create_order/app.py` exists and no service-account JSON is staged.

- [ ] **Step 2: Confirm credentials were not copied**

Run:

```bash
find backend/lambdas/create_order -name 'creds-sa.json' -o -name '*credential*'
```

Expected: no output.

- [ ] **Step 3: Patch order Lambda imports and repository accessor**

In `backend/lambdas/create_order/app.py`, remove `import gspread` and add:

```python
from backend.shared.submissions_mapping import map_live_submission
from backend.shared.submissions_repository import SubmissionsRepository
```

Add near the top:

```python
def get_submissions_repository():
    return SubmissionsRepository()
```

- [ ] **Step 4: Replace dynamic hold functions**

Replace `store_dynamic_submission` and `lookup_dynamic_submission` with:

```python
def store_dynamic_submission(event, submission_id):
    payload = {
        "type": event.get("type"),
        "eventTitle": event.get("title"),
        "formData": event,
    }
    get_submissions_repository().save_payment_hold(submission_id, payload)
    print("✅ dynamic submission stored in DynamoDB")


def lookup_dynamic_submission(submission_id):
    payload = get_submissions_repository().get_payment_hold(submission_id)
    if payload:
        return payload
    print("⚠️ submission not found")
    return {}
```

- [ ] **Step 5: Replace final sheet update helper**

Replace `update_google_sheet(form, name, email, phone, sheet_name)` with:

```python
def create_submission_record(form, name, email, phone, source, raw_data, payment_status="none", payment_provider="none", amount=None):
    submission_id = raw_data.get("submission_id") or raw_data.get("submissionId") or str(uuid.uuid4())
    record = map_live_submission(
        submission_id=submission_id,
        title=form,
        name=name,
        email=email,
        phone=phone,
        source=source,
        raw_data=raw_data,
        payment_status=payment_status,
        payment_provider=payment_provider,
        amount=amount,
        currency="USD",
    )
    get_submissions_repository().create_submission(record)
    print("✅ DynamoDB submission created")
    return record
```

- [ ] **Step 6: Replace processed-submission checks**

Replace each `Processed Submissions` worksheet read/append block with:

```python
repo = get_submissions_repository()
if submission_id and not repo.mark_processed_payment(submission_id, "stripe", {"sessionId": session_id}):
    print(f"⚠️ Submission {submission_id} already processed. Skipping.")
    return {"statusCode": 200, "body": json.dumps({"status": "already processed"})}
```

For PayPal capture/webhook paths, use:

```python
repo = get_submissions_repository()
if submission_id and not repo.mark_processed_payment(submission_id, "paypal", {"orderId": order_id}):
    print(f"⚠️ Submission {submission_id} already processed. Skipping.")
    return {"statusCode": 200, "body": json.dumps({"status": "already processed"})}
```

- [ ] **Step 7: Replace final event/vendor sheet writes**

Replace each call shaped like:

```python
update_google_sheet(
    form=email_subject,
    name=form_data.get("fullName", buyer_info["full_name"]),
    email=form_data.get("email", buyer_info["email"]),
    phone=form_data.get("phone", ""),
    sheet_name="Event Submissions"
)
```

with:

```python
create_submission_record(
    form=email_subject,
    name=form_data.get("fullName", buyer_info["full_name"]),
    email=form_data.get("email", buyer_info["email"]),
    phone=form_data.get("phone", ""),
    source=event_type or order_type or "payment",
    raw_data={**form_data, "submission_id": submission_id},
    payment_status="paid",
    payment_provider="stripe",
    amount=form_data.get("grandTotal"),
)
```

Use `payment_provider="paypal"` in PayPal completion paths and `payment_status="none"` for non-profit/no-payment vendor paths.

- [ ] **Step 8: Run static import smoke check**

Run:

```bash
PYTHONPATH=. python3 - <<'PY'
import backend.lambdas.create_order.app as app
print(callable(app.store_dynamic_submission))
print(callable(app.lookup_dynamic_submission))
PY
```

Expected:

```text
True
True
```

- [ ] **Step 9: Commit**

```bash
git add backend/lambdas/create_order
git commit -m "Move order submission workflow to DynamoDB"
```

## Task 6: Replace Google Sheet Writes In Mailer Lambda Source

**Files:**
- Create: `backend/lambdas/sotf_mailer/` from current `aws-export/lambda/sotf_mailer/`
- Modify: `backend/lambdas/sotf_mailer/lambda_function.py`

- [ ] **Step 1: Copy current mailer Lambda into tracked backend excluding vendored packages and credentials**

Run:

```bash
mkdir -p backend/lambdas/sotf_mailer
rsync -a \
  --exclude 'botocore' \
  --exclude 'boto3' \
  --exclude 'gspread' \
  --exclude 'google' \
  --exclude 'cryptography' \
  --exclude 'requests' \
  --exclude '*.dist-info' \
  --exclude 'creds-sa.json' \
  aws-export/lambda/sotf_mailer/ backend/lambdas/sotf_mailer/
```

- [ ] **Step 2: Patch imports and repository accessor**

In `backend/lambdas/sotf_mailer/lambda_function.py`, remove `import gspread` and add:

```python
from backend.shared.submissions_mapping import map_live_submission
from backend.shared.submissions_repository import SubmissionsRepository
```

Add:

```python
def get_submissions_repository():
    return SubmissionsRepository()
```

- [ ] **Step 3: Replace `update_google_sheet`**

Replace `update_google_sheet(form, name, email, phone)` with:

```python
def create_submission_record(form, name, email, phone, source, raw_data):
    submission_id = raw_data.get("submission_id") or str(uuid.uuid4())
    record = map_live_submission(
        submission_id=submission_id,
        title=form,
        name=name,
        email=email,
        phone=phone,
        source=source,
        raw_data=raw_data,
    )
    get_submissions_repository().create_submission(record)
    print("✅ DynamoDB submission created")
    return record
```

- [ ] **Step 4: Replace mailer call site**

Replace:

```python
update_google_sheet(subject[4:], contact_name, reply_to, contact_phone)
```

with:

```python
create_submission_record(
    form=subject[4:],
    name=contact_name,
    email=reply_to,
    phone=contact_phone,
    source=event_body.get("formType", "mailer"),
    raw_data={**event_body, "submission_id": str(uuid.uuid4())},
)
```

- [ ] **Step 5: Run static import smoke check**

Run:

```bash
PYTHONPATH=. python3 - <<'PY'
import backend.lambdas.sotf_mailer.lambda_function as mailer
print(callable(mailer.create_submission_record))
PY
```

Expected:

```text
True
```

- [ ] **Step 6: Commit**

```bash
git add backend/lambdas/sotf_mailer
git commit -m "Move mailer submissions to DynamoDB"
```

## Task 7: Add Google Sheet Import Script

**Files:**
- Create: `backend/scripts/import_google_sheet.py`
- Test: `backend/tests/test_submissions_mapping.py` already covers row mapping.

- [ ] **Step 1: Create import script**

Create `backend/scripts/import_google_sheet.py`:

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import gspread

from backend.shared.submissions_mapping import (
    map_payment_hold_row,
    map_processed_payment_row,
    map_sheet_submission_row,
)
from backend.shared.submissions_repository import SubmissionsRepository

SUBMISSION_WORKSHEETS = {"Sheet1", "Event Submissions", "Golf Event"}
HOLD_WORKSHEETS = {"Event Hold", "Golf Event Hold"}
PROCESSED_WORKSHEETS = {"Processed Submissions"}


def import_spreadsheet(credentials_path: str, spreadsheet_name: str, repo: SubmissionsRepository, dry_run: bool = False):
    gc = gspread.service_account(filename=credentials_path)
    spreadsheet = gc.open(spreadsheet_name)
    counts = {"submission": 0, "payment_hold": 0, "processed_payment": 0}

    for worksheet in spreadsheet.worksheets():
        title = worksheet.title
        rows = worksheet.get_all_values()
        if not rows:
            continue

        if title in SUBMISSION_WORKSHEETS:
            headers = rows[0] if title in {"Sheet1", "Event Submissions"} else ["Submissions", "Date", "Name", "Email", "Phone"]
            data_rows = rows[1:] if title in {"Sheet1", "Event Submissions"} else rows
            start_row = 2 if title in {"Sheet1", "Event Submissions"} else 1
            for offset, values in enumerate(data_rows):
                record = map_sheet_submission_row(title, start_row + offset, headers, values)
                if not dry_run:
                    repo.create_submission(record)
                counts["submission"] += 1

        if title in HOLD_WORKSHEETS:
            for row_number, values in enumerate(rows[1:], start=2):
                if len(values) >= 2 and values[0]:
                    record = map_payment_hold_row(title, row_number, values[0], values[1])
                    if not dry_run:
                        repo.table.put_item(Item=record)
                    counts["payment_hold"] += 1

        if title in PROCESSED_WORKSHEETS:
            for row_number, values in enumerate(rows, start=1):
                if values and values[0]:
                    record = map_processed_payment_row(title, row_number, values)
                    if not dry_run:
                        repo.table.put_item(Item=record)
                    counts["processed_payment"] += 1

    return counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--spreadsheet", default="Forms Submissions")
    parser.add_argument("--table", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not Path(args.credentials).exists():
        raise SystemExit(f"Credentials file not found: {args.credentials}")

    repo = SubmissionsRepository(table_name=args.table)
    counts = import_spreadsheet(args.credentials, args.spreadsheet, repo, args.dry_run)
    print(counts)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Make script executable**

Run:

```bash
chmod +x backend/scripts/import_google_sheet.py
```

- [ ] **Step 3: Dry-run import against existing sheet**

Run:

```bash
/tmp/sotf-gspread-venv/bin/python backend/scripts/import_google_sheet.py \
  --credentials aws-export/lambda/create_order/creds-sa.json \
  --table sotf-submissions-dev \
  --dry-run
```

Expected: printed counts for submission, payment_hold, and processed_payment records.

- [ ] **Step 4: Import to dev table**

Run:

```bash
/tmp/sotf-gspread-venv/bin/python backend/scripts/import_google_sheet.py \
  --credentials aws-export/lambda/create_order/creds-sa.json \
  --table sotf-submissions-dev
```

Expected: printed counts matching dry-run.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/import_google_sheet.py
git commit -m "Add Google Sheet import script"
```

## Task 8: Add Angular Service Methods

**Files:**
- Modify: `src/environments/environment.ts`
- Modify: `src/environments/environment.prod.ts`
- Modify: `src/app/services/cms.service.ts`
- Modify: `src/app/services/cms.service.spec.ts`

- [ ] **Step 1: Add failing service tests**

Add tests to `src/app/services/cms.service.spec.ts`:

```typescript
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from 'src/environments/environment';
import { CmsService } from './cms.service';

describe('CmsService submissions', () => {
  let service: CmsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(CmsService);
    httpMock = TestBed.inject(HttpTestingController);
    sessionStorage.setItem('adminToken', 'cms-admin-token');
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('lists admin submissions', () => {
    service.getSubmissions().subscribe(res => {
      expect(res.items[0].submissionId).toBe('s1');
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.submissions}`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer cms-admin-token');
    req.flush({ items: [{ submissionId: 's1', submissionTitle: 'Volunteer', status: 'New' }] });
  });

  it('updates admin submission fields', () => {
    service.updateSubmissionAdminFields('s1', {
      status: 'Complete',
      assignedTo: 'Patrick',
      notes: 'Verified',
    }).subscribe(res => {
      expect(res.status).toBe('Complete');
    });

    const req = httpMock.expectOne(`${environment.cms.baseUrl}${environment.cms.routes.submissions}/s1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.status).toBe('Complete');
    req.flush({ submissionId: 's1', status: 'Complete', assignedTo: 'Patrick', notes: 'Verified' });
  });
});
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
npx ng test --watch=false --browsers=ChromeHeadless --include src/app/services/cms.service.spec.ts
```

Expected: FAIL because `getSubmissions`, `updateSubmissionAdminFields`, and route config do not exist.

- [ ] **Step 3: Add environment routes**

In both environment files, add:

```typescript
submissions: "/admin/submissions"
```

inside `environment.cms.routes`.

- [ ] **Step 4: Add service interfaces and methods**

In `src/app/services/cms.service.ts`, add:

```typescript
export interface AdminSubmission {
  submissionId: string;
  submissionTitle: string;
  submittedAt?: string;
  name?: string;
  email?: string;
  phone?: string;
  paymentStatus?: string;
  paymentProvider?: string;
  amount?: number;
  currency?: string;
  source?: string;
  status: string;
  assignedTo: string;
  notes: string;
  rawData?: any;
}

export interface AdminSubmissionListResponse {
  items: AdminSubmission[];
}

export interface AdminSubmissionUpdate {
  status: string;
  assignedTo: string;
  notes: string;
}
```

Add methods:

```typescript
getSubmissions(): Observable<AdminSubmissionListResponse> {
  const token = sessionStorage.getItem('adminToken');
  return this.http.get<AdminSubmissionListResponse>(
    `${this.baseUrl}${this.routes.submissions}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

updateSubmissionAdminFields(submissionId: string, update: AdminSubmissionUpdate): Observable<AdminSubmission> {
  const token = sessionStorage.getItem('adminToken');
  return this.http.patch<AdminSubmission>(
    `${this.baseUrl}${this.routes.submissions}/${submissionId}`,
    update,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}
```

- [ ] **Step 5: Run service tests and verify they pass**

Run:

```bash
npx ng test --watch=false --browsers=ChromeHeadless --include src/app/services/cms.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/environments/environment.ts src/environments/environment.prod.ts src/app/services/cms.service.ts src/app/services/cms.service.spec.ts
git commit -m "Add admin submissions service methods"
```

## Task 9: Add Admin Submissions UI

**Files:**
- Modify: `src/app/pages/admin/admin.component.ts`
- Modify: `src/app/pages/admin/admin.component.html`
- Modify: `src/app/pages/admin/admin.component.css`
- Modify: `src/app/pages/admin/admin.component.spec.ts`

- [ ] **Step 1: Add failing admin UI tests**

Extend the `CmsService` spy in `src/app/pages/admin/admin.component.spec.ts` with `getSubmissions` and `updateSubmissionAdminFields`, then add:

```typescript
it('switches to submissions and renders spreadsheet rows', () => {
  cmsService.getSubmissions.and.returnValue(of({
    items: [{
      submissionId: 's1',
      submissionTitle: 'Volunteer Request',
      submittedAt: '2026-06-05T10:00:00-07:00',
      name: 'Pat Halcrow',
      email: 'pat@example.com',
      phone: '555-1212',
      paymentStatus: 'none',
      paymentProvider: 'none',
      status: 'New',
      assignedTo: '',
      notes: '',
      rawData: { message: 'Available morning' },
    }]
  }));

  fixture.detectChanges();
  const button = nativeElement.querySelector('[data-testid="admin-section-submissions"]');
  button.click();
  fixture.detectChanges();

  expect(cmsService.getSubmissions).toHaveBeenCalled();
  expect(nativeElement.querySelector('.submissions-table').textContent).toContain('Volunteer Request');
  expect(nativeElement.querySelector('.submissions-table').textContent).toContain('Pat Halcrow');
});

it('opens a submission detail panel and saves admin fields', () => {
  cmsService.getSubmissions.and.returnValue(of({
    items: [{
      submissionId: 's1',
      submissionTitle: 'Volunteer Request',
      submittedAt: '2026-06-05T10:00:00-07:00',
      name: 'Pat Halcrow',
      email: 'pat@example.com',
      phone: '555-1212',
      paymentStatus: 'none',
      paymentProvider: 'none',
      status: 'New',
      assignedTo: '',
      notes: '',
      rawData: { message: 'Available morning' },
    }]
  }));
  cmsService.updateSubmissionAdminFields.and.returnValue(of({
    submissionId: 's1',
    submissionTitle: 'Volunteer Request',
    status: 'Complete',
    assignedTo: 'Patrick',
    notes: 'Verified',
  } as any));

  fixture.detectChanges();
  nativeElement.querySelector('[data-testid="admin-section-submissions"]').click();
  fixture.detectChanges();
  nativeElement.querySelector('[data-testid="submission-row-s1"]').click();
  fixture.detectChanges();

  component.selectedSubmission!.status = 'Complete';
  component.selectedSubmission!.assignedTo = 'Patrick';
  component.selectedSubmission!.notes = 'Verified';
  component.saveSelectedSubmission();

  expect(cmsService.updateSubmissionAdminFields).toHaveBeenCalledWith('s1', {
    status: 'Complete',
    assignedTo: 'Patrick',
    notes: 'Verified',
  });
});
```

- [ ] **Step 2: Run admin component tests and verify they fail**

Run:

```bash
npx ng test --watch=false --browsers=ChromeHeadless --include src/app/pages/admin/admin.component.spec.ts
```

Expected: FAIL because UI state and template controls do not exist.

- [ ] **Step 3: Add admin component state and methods**

In `src/app/pages/admin/admin.component.ts`, import:

```typescript
import { CmsService, CmsEvent, AdminSubmission } from 'src/app/services/cms.service';
```

Add state:

```typescript
adminSection: 'events' | 'submissions' = 'events';
submissions: AdminSubmission[] = [];
selectedSubmission?: AdminSubmission;
submissionSearch = '';
submissionStatuses = ['New', 'In Review', 'Follow Up', 'Complete', 'Archived'];
```

Add methods:

```typescript
selectAdminSection(section: 'events' | 'submissions') {
  this.adminSection = section;
  if (section === 'submissions' && !this.submissions.length) {
    this.loadSubmissions();
  }
}

loadSubmissions() {
  this.cmsService.getSubmissions().subscribe({
    next: res => this.submissions = res.items || [],
    error: err => {
      console.error('Submissions load failed', err);
      this.showModal('Submissions unavailable', 'Could not load submissions.', 'danger');
    }
  });
}

get filteredSubmissions(): AdminSubmission[] {
  const query = this.submissionSearch.trim().toLowerCase();
  if (!query) return this.submissions;
  return this.submissions.filter(row =>
    [row.submissionTitle, row.name, row.email, row.phone, row.status, row.assignedTo, row.notes]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query))
  );
}

selectSubmission(submission: AdminSubmission) {
  this.selectedSubmission = { ...submission };
}

saveSelectedSubmission() {
  if (!this.selectedSubmission) return;
  const { submissionId, status, assignedTo, notes } = this.selectedSubmission;
  this.cmsService.updateSubmissionAdminFields(submissionId, { status, assignedTo, notes }).subscribe({
    next: updated => {
      this.submissions = this.submissions.map(row => row.submissionId === updated.submissionId ? { ...row, ...updated } : row);
      this.selectedSubmission = { ...this.selectedSubmission!, ...updated };
      this.showModal('Submission saved', 'Admin fields have been updated.', 'success');
    },
    error: err => {
      console.error('Submission save failed', err);
      this.showModal('Save failed', 'Could not update the submission.', 'danger');
    }
  });
}
```

- [ ] **Step 4: Add section switcher and submissions table**

In `src/app/pages/admin/admin.component.html`, add buttons in the toolbar:

```html
<button type="button" class="section-button" [class.active]="adminSection === 'events'" (click)="selectAdminSection('events')">Events</button>
<button type="button" class="section-button" [class.active]="adminSection === 'submissions'" data-testid="admin-section-submissions" (click)="selectAdminSection('submissions')">Submissions</button>
```

Wrap the existing event tabs/workspace in:

```html
<ng-container *ngIf="adminSection === 'events'">
  <!-- existing event tabs and event editor markup -->
</ng-container>
```

Add submissions markup after the events container:

```html
<section *ngIf="adminSection === 'submissions'" class="submissions-workspace">
  <div class="submissions-tools">
    <input class="admin-input" [(ngModel)]="submissionSearch" placeholder="Search submissions" />
    <button type="button" class="action-button secondary" (click)="loadSubmissions()">Refresh</button>
  </div>

  <div class="submissions-table-wrap">
    <table class="submissions-table">
      <thead>
        <tr>
          <th>Submission</th>
          <th>Date</th>
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th>Payment</th>
          <th>Status</th>
          <th>Assigned To</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let submission of filteredSubmissions" [attr.data-testid]="'submission-row-' + submission.submissionId" (click)="selectSubmission(submission)">
          <td>{{ submission.submissionTitle }}</td>
          <td>{{ submission.submittedAt }}</td>
          <td>{{ submission.name }}</td>
          <td>{{ submission.email }}</td>
          <td>{{ submission.phone }}</td>
          <td>{{ submission.paymentStatus }}</td>
          <td>{{ submission.status }}</td>
          <td>{{ submission.assignedTo }}</td>
          <td>{{ submission.notes }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</section>

<aside *ngIf="selectedSubmission" class="submission-detail-panel">
  <h2>{{ selectedSubmission.submissionTitle }}</h2>
  <label class="control-group">
    <span>Status</span>
    <select class="admin-select" [(ngModel)]="selectedSubmission.status">
      <option *ngFor="let status of submissionStatuses" [value]="status">{{ status }}</option>
    </select>
  </label>
  <label class="control-group">
    <span>Assigned To</span>
    <input class="admin-input" [(ngModel)]="selectedSubmission.assignedTo" />
  </label>
  <label class="control-group">
    <span>Notes</span>
    <textarea class="admin-textarea" [(ngModel)]="selectedSubmission.notes" rows="5"></textarea>
  </label>
  <pre class="submission-raw">{{ selectedSubmission.rawData | json }}</pre>
  <button type="button" class="action-button primary" (click)="saveSelectedSubmission()">Save Submission</button>
</aside>
```

- [ ] **Step 5: Add admin table styles**

Add to `src/app/pages/admin/admin.component.css`:

```css
.section-button {
  border: 1px solid #d0d7de;
  background: #fff;
  color: #243447;
  padding: 0.55rem 0.9rem;
  border-radius: 6px;
  font-weight: 700;
}

.section-button.active {
  background: #243447;
  color: #fff;
}

.submissions-workspace {
  display: grid;
  gap: 1rem;
}

.submissions-tools {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.submissions-table-wrap {
  overflow: auto;
  border: 1px solid #d0d7de;
  background: #fff;
}

.submissions-table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.submissions-table th,
.submissions-table td {
  padding: 0.7rem;
  border-bottom: 1px solid #e8edf2;
  text-align: left;
  vertical-align: top;
}

.submissions-table th {
  position: sticky;
  top: 0;
  background: #f6f8fa;
  color: #243447;
  font-weight: 800;
}

.submissions-table tbody tr {
  cursor: pointer;
}

.submissions-table tbody tr:hover {
  background: #f5f8fb;
}

.submission-detail-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: min(520px, 100vw);
  height: 100vh;
  overflow: auto;
  background: #fff;
  border-left: 1px solid #d0d7de;
  box-shadow: -12px 0 30px rgba(15, 23, 42, 0.16);
  padding: 1.25rem;
  z-index: 20;
}

.submission-raw {
  max-height: 260px;
  overflow: auto;
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  padding: 0.85rem;
  font-size: 0.8rem;
}
```

- [ ] **Step 6: Run admin UI tests**

Run:

```bash
npx ng test --watch=false --browsers=ChromeHeadless --include src/app/pages/admin/admin.component.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/admin/admin.component.ts src/app/pages/admin/admin.component.html src/app/pages/admin/admin.component.css src/app/pages/admin/admin.component.spec.ts
git commit -m "Add admin submissions table"
```

## Task 10: Package And Deploy Tracked Lambdas

**Files:**
- Create: `backend/scripts/package_lambda.sh`
- Create: `backend/scripts/deploy_lambdas.sh`

- [ ] **Step 1: Create package script**

Create `backend/scripts/package_lambda.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

LAMBDA_DIR="$1"
OUT_ZIP="$2"

rm -rf /tmp/sotf-lambda-package
mkdir -p /tmp/sotf-lambda-package
rsync -a "$LAMBDA_DIR"/ /tmp/sotf-lambda-package/
mkdir -p /tmp/sotf-lambda-package/backend/shared
rsync -a backend/shared/ /tmp/sotf-lambda-package/backend/shared/
touch /tmp/sotf-lambda-package/backend/__init__.py
touch /tmp/sotf-lambda-package/backend/shared/__init__.py

(cd /tmp/sotf-lambda-package && zip -qr "$OUT_ZIP" .)
echo "$OUT_ZIP"
```

- [ ] **Step 2: Create deploy script**

Create `backend/scripts/deploy_lambdas.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
STAGE="${1:-dev}"

if [[ "$STAGE" == "prod" ]]; then
  EVENTS_FN="events_service"
  MAILER_FN="sotf_mailer"
  ORDER_FN="create_order"
  TABLE_NAME="sotf-submissions"
else
  EVENTS_FN="dev_events_service"
  MAILER_FN="dev_sotf_mailer"
  ORDER_FN="dev_create_order"
  TABLE_NAME="sotf-submissions-dev"
fi

deploy_one() {
  local source_dir="$1"
  local function_name="$2"
  local zip_path="/tmp/${function_name}.zip"
  backend/scripts/package_lambda.sh "$source_dir" "$zip_path"
  aws lambda update-function-code --region "$REGION" --function-name "$function_name" --zip-file "fileb://$zip_path" >/dev/null
  aws lambda wait function-updated --region "$REGION" --function-name "$function_name"
  aws lambda update-function-configuration --region "$REGION" --function-name "$function_name" --environment "Variables={SUBMISSIONS_TABLE=$TABLE_NAME}" >/dev/null
  aws lambda wait function-updated --region "$REGION" --function-name "$function_name"
  echo "Deployed $function_name with SUBMISSIONS_TABLE=$TABLE_NAME"
}

deploy_one backend/lambdas/events_service "$EVENTS_FN"
deploy_one backend/lambdas/sotf_mailer "$MAILER_FN"
deploy_one backend/lambdas/create_order "$ORDER_FN"
```

- [ ] **Step 3: Make scripts executable**

Run:

```bash
chmod +x backend/scripts/package_lambda.sh backend/scripts/deploy_lambdas.sh
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/package_lambda.sh backend/scripts/deploy_lambdas.sh
git commit -m "Add tracked Lambda deployment scripts"
```

- [ ] **Step 5: Deploy dev Lambdas**

Run:

```bash
AWS_REGION=us-west-2 backend/scripts/deploy_lambdas.sh dev
```

Expected: script prints deployed function names with `SUBMISSIONS_TABLE=sotf-submissions-dev`.

## Task 11: Verify Dev End-To-End

**Files:**
- No code files unless verification exposes a defect.

- [ ] **Step 1: Verify admin submissions API**

Run:

```bash
DEV_CMS_URL="$(aws lambda get-function-url-config --function-name dev_events_service --query 'FunctionUrl' --output text)"
curl -s -H 'Authorization: Bearer cms-admin-token' "${DEV_CMS_URL}admin/submissions" | python3 -m json.tool
```

Expected: JSON object with an `items` array.

- [ ] **Step 2: Run Angular tests**

Run:

```bash
npx ng test --watch=false --browsers=ChromeHeadless
```

Expected: all frontend tests PASS.

- [ ] **Step 3: Build Angular app**

Run:

```bash
npx ng build --configuration production
```

Expected: production build succeeds.

- [ ] **Step 4: Start local dev server**

Run:

```bash
npx ng serve --host 0.0.0.0 --port 4200
```

Expected: server available at `http://localhost:4200/`.

- [ ] **Step 5: Manual admin UI verification**

Open `http://localhost:4200/admin`, switch to `Submissions`, confirm imported rows render, open a row, update status/assigned-to/notes, and confirm the row updates after save.

- [ ] **Step 6: Manual form/payment verification**

Perform these dev checks:

- Submit a volunteer/contact form and verify a new DynamoDB `submission` appears.
- Submit a no-payment vendor form and verify emails still send and a new DynamoDB `submission` appears.
- Complete a Stripe test payment and verify exactly one `submission` and one `processed_payment` record appear.
- Exercise the PayPal success path as much as current sandbox access allows and verify idempotency markers if a successful capture can be completed.

- [ ] **Step 7: Commit fixes or verification notes**

If code changed during verification:

```bash
git add .
git commit -m "Verify DynamoDB submissions flow"
```

If no code changed, do not create an empty commit.

## Task 12: Deploy Production And Keep Google Sheet As Temporary Fallback

**Files:**
- No code files unless production verification exposes a defect.

- [ ] **Step 1: Import existing sheet into production table**

Run:

```bash
/tmp/sotf-gspread-venv/bin/python backend/scripts/import_google_sheet.py \
  --credentials aws-export/lambda/create_order/creds-sa.json \
  --table sotf-submissions
```

Expected: printed counts for imported records.

- [ ] **Step 2: Deploy production Lambdas**

Run:

```bash
AWS_REGION=us-west-2 backend/scripts/deploy_lambdas.sh prod
```

Expected: script prints deployed function names with `SUBMISSIONS_TABLE=sotf-submissions`.

- [ ] **Step 3: Build and deploy frontend**

Run:

```bash
npx ng build --configuration production
aws s3 sync dist/spirit-of-the-fourth/ s3://sotf-site-470065668628-us-west-2 --delete
aws cloudfront create-invalidation --distribution-id E3GE4UTEXVBWT2 --paths '/*'
```

Expected: S3 sync completes and CloudFront invalidation is created.

- [ ] **Step 4: Production smoke test**

Open `https://spiritofthefourth.org/admin`, log in, switch to `Submissions`, confirm rows load, open a row, update admin fields, and verify the update persists after refresh.

- [ ] **Step 5: Production touchpoint test**

Run the same live touchpoints previously used for email/payment verification:

- Volunteer/contact form sends emails and creates a DynamoDB `submission`.
- Vendor no-payment flow sends emails and creates a DynamoDB `submission`.
- Stripe payment flow sends emails, creates one DynamoDB `submission`, and creates one `processed_payment`.
- PayPal payment flow is verified when live PayPal testing is available.

- [ ] **Step 6: Push commits**

Run:

```bash
git status --short
git push origin main
```

Expected: local commits are pushed to GitHub and working tree is clean.
