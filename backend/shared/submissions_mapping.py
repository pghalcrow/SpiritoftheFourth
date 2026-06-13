import hashlib
import json
from datetime import datetime
from zoneinfo import ZoneInfo


PACIFIC_TZ = ZoneInfo("America/Los_Angeles")
SHEET_DATETIME_FORMATS = (
    "%Y-%m-%d %H:%M",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
)
IMPORT_FALLBACK_SUBMITTED_AT = "1970-01-01T00:00:00-08:00"


def now_iso():
    return datetime.now(PACIFIC_TZ).replace(microsecond=0).isoformat()


def parse_sheet_datetime(value):
    if value is None:
        return now_iso()

    cleaned_value = str(value).strip()
    if not cleaned_value:
        return now_iso()

    for date_format in SHEET_DATETIME_FORMATS:
        try:
            parsed = datetime.strptime(cleaned_value, date_format)
            return parsed.replace(tzinfo=PACIFIC_TZ).isoformat()
        except ValueError:
            continue
    return cleaned_value


def stable_submission_id(source, row_number, values):
    digest_input = json.dumps([source, row_number, values], separators=(",", ":"))
    digest = hashlib.sha256(digest_input.encode("utf-8")).hexdigest()[:12]
    source_slug = source.lower().replace(" ", "-")
    return f"import-{source_slug}-{row_number}-{digest}"


def build_submission_sk(submitted_at, submission_id):
    return f"{submitted_at}#{submission_id}"


def map_sheet_submission_row(worksheet, row_number, headers, values):
    row = dict(zip(headers, values))
    raw_submitted_at = row.get("SubmittedDate") or row.get("Date")
    submitted_at = (
        parse_sheet_datetime(raw_submitted_at)
        if raw_submitted_at and str(raw_submitted_at).strip()
        else IMPORT_FALLBACK_SUBMITTED_AT
    )
    created_at = now_iso()
    submission_id = stable_submission_id(worksheet, row_number, values)

    return {
        "pk": "SUBMISSION",
        "sk": build_submission_sk(submitted_at, submission_id),
        "recordType": "submission",
        "submissionId": submission_id,
        "submissionTitle": row.get("Form") or row.get("Submissions") or "",
        "submittedAt": submitted_at,
        "source": worksheet,
        "name": row.get("Name", ""),
        "email": row.get("Email", ""),
        "phone": row.get("Phone", ""),
        "status": "New",
        "assignedTo": "",
        "notes": "",
        "createdAt": created_at,
        "updatedAt": created_at,
        "updatedBy": "import",
        "paymentStatus": "unknown",
        "paymentProvider": "unknown",
        "amount": None,
        "currency": "USD",
        "rawData": {
            "worksheet": worksheet,
            "rowNumber": row_number,
            "headers": headers,
            "values": values,
        },
    }


def map_payment_hold_row(worksheet, row_number, submission_id, payload_json):
    created_at = now_iso()

    return {
        "pk": "PAYMENT_HOLD",
        "sk": submission_id,
        "recordType": "payment_hold",
        "submissionId": submission_id,
        "createdAt": created_at,
        "updatedAt": created_at,
        "payload": json.loads(payload_json),
        "rawData": {
            "worksheet": worksheet,
            "rowNumber": row_number,
        },
    }


def map_processed_payment_row(worksheet, row_number, values):
    if len(values) < 2 or not values[0]:
        raise ValueError(f"Invalid processed payment row in {worksheet} row {row_number}")

    submission_id = values[0]
    processed_at = parse_sheet_datetime(values[1])
    created_at = now_iso()

    return {
        "pk": "PROCESSED_PAYMENT",
        "sk": submission_id,
        "recordType": "processed_payment",
        "submissionId": submission_id,
        "provider": "unknown",
        "providerSessionId": "",
        "processedAt": processed_at,
        "createdAt": created_at,
        "updatedAt": created_at,
        "rawData": {
            "worksheet": worksheet,
            "rowNumber": row_number,
            "values": values,
        },
    }


def map_live_submission(
    submission_id,
    title,
    name,
    email,
    phone,
    source,
    raw_data,
    payment_status="none",
    payment_provider="none",
    amount=None,
    currency="USD",
    submitted_at=None,
):
    submitted_at = submitted_at or now_iso()

    return {
        "pk": "SUBMISSION",
        "sk": build_submission_sk(submitted_at, submission_id),
        "recordType": "submission",
        "submissionId": submission_id,
        "submissionTitle": title,
        "submittedAt": submitted_at,
        "source": source,
        "name": name,
        "email": email,
        "phone": phone,
        "status": "New",
        "assignedTo": "",
        "notes": "",
        "createdAt": submitted_at,
        "updatedAt": submitted_at,
        "updatedBy": "system",
        "paymentStatus": payment_status,
        "paymentProvider": payment_provider,
        "amount": amount,
        "currency": currency,
        "rawData": raw_data,
    }
