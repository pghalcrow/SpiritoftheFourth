#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from collections import Counter
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

from backend.shared.submissions_mapping import (
    map_payment_hold_row,
    map_processed_payment_row,
    map_sheet_submission_row,
)


SUBMISSION_WORKSHEETS = {"Sheet1", "Event Submissions", "Golf Event"}
HOLD_WORKSHEETS = {"Event Hold", "Golf Event Hold"}
PROCESSED_WORKSHEETS = {"Processed Submissions"}


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def normalize_phone(value: Any) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def normalize_title(value: Any) -> str:
    title = normalize_text(value)
    title = re.sub(r"^new\s+", "", title)
    title = title.replace("—", "-")
    title = re.sub(r"\s+", " ", title)
    return title


def parse_iso_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    cleaned_value = str(value).strip()
    if not cleaned_value:
        return None
    try:
        return datetime.fromisoformat(cleaned_value)
    except ValueError:
        return None


def comparable_submission_key(record: dict[str, Any]) -> tuple[str, str, str, str, str]:
    return (
        normalize_title(record.get("submissionTitle")),
        normalize_text(record.get("submittedAt")),
        normalize_text(record.get("name")),
        normalize_text(record.get("email")),
        normalize_phone(record.get("phone")),
    )


def query_all_by_pk(table, pk: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    last_key = None

    while True:
        kwargs: dict[str, Any] = {"KeyConditionExpression": Key("pk").eq(pk)}
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        result = table.query(**kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break

    return items


def decimal_safe(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, list):
        return [decimal_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: decimal_safe(item) for key, item in value.items()}
    return value


def add_named_raw_values(record: dict[str, Any], headers: list[str], values: list[str]) -> dict[str, Any]:
    raw_data = dict(record.get("rawData") or {})
    for header, value in zip(headers, values):
        cleaned_header = str(header or "").strip()
        if cleaned_header and value not in (None, ""):
            raw_data.setdefault(cleaned_header, value)
    record["rawData"] = raw_data
    return record


def is_same_submission(record: dict[str, Any], existing: dict[str, Any]) -> bool:
    if comparable_submission_key(record) == comparable_submission_key(existing):
        return True

    if normalize_title(record.get("submissionTitle")) != normalize_title(existing.get("submissionTitle")):
        return False
    if normalize_text(record.get("email")) != normalize_text(existing.get("email")):
        return False
    if normalize_phone(record.get("phone")) != normalize_phone(existing.get("phone")):
        return False

    record_date = parse_iso_datetime(record.get("submittedAt"))
    existing_date = parse_iso_datetime(existing.get("submittedAt"))
    if not record_date or not existing_date:
        return False

    return abs((record_date - existing_date).total_seconds()) <= 8 * 60 * 60


def submission_rows(spreadsheet):
    for worksheet in spreadsheet.worksheets():
        title = worksheet.title
        if title not in SUBMISSION_WORKSHEETS:
            continue

        rows = worksheet.get_all_values()
        if not rows:
            continue

        if title in {"Sheet1", "Event Submissions"}:
            headers = rows[0]
            data_rows = rows[1:]
            start_row = 2
        else:
            headers = ["Submissions", "Date", "Name", "Email", "Phone"]
            data_rows = rows
            start_row = 1

        for offset, values in enumerate(data_rows):
            if not any(values):
                continue
            row_number = start_row + offset
            record = map_sheet_submission_row(title, row_number, headers, values)
            yield add_named_raw_values(record, headers, values)


def payment_hold_rows(spreadsheet):
    for worksheet in spreadsheet.worksheets():
        title = worksheet.title
        if title not in HOLD_WORKSHEETS:
            continue

        for row_number, values in enumerate(worksheet.get_all_values()[1:], start=2):
            if len(values) < 2 or not values[0]:
                continue
            yield map_payment_hold_row(title, row_number, values[0], values[1])


def processed_payment_rows(spreadsheet):
    for worksheet in spreadsheet.worksheets():
        title = worksheet.title
        if title not in PROCESSED_WORKSHEETS:
            continue

        for row_number, values in enumerate(worksheet.get_all_values(), start=1):
            if not values or not values[0]:
                continue
            yield map_processed_payment_row(title, row_number, values)


def put_if_missing(table, record: dict[str, Any]) -> bool:
    key = {"pk": record["pk"], "sk": record["sk"]}
    if "Item" in table.get_item(Key=key):
        return False

    table.put_item(
        Item=decimal_safe(record),
        ConditionExpression="attribute_not_exists(pk) AND attribute_not_exists(sk)",
    )
    return True


def backfill_missing_data(credentials_path: str, spreadsheet_name: str, table_name: str, region: str, apply: bool):
    import gspread

    spreadsheet = gspread.service_account(filename=credentials_path).open(spreadsheet_name)
    table = boto3.resource("dynamodb", region_name=region).Table(table_name)

    existing_submissions = query_all_by_pk(table, "SUBMISSION")
    existing_keys = {comparable_submission_key(record) for record in existing_submissions}
    existing_submission_ids = {record.get("submissionId") for record in existing_submissions}

    missing_submissions: list[dict[str, Any]] = []
    for record in submission_rows(spreadsheet):
        comparable_key = comparable_submission_key(record)
        if (
            record.get("submissionId") in existing_submission_ids
            or comparable_key in existing_keys
            or any(is_same_submission(record, existing) for existing in existing_submissions)
        ):
            continue
        missing_submissions.append(record)
        existing_keys.add(comparable_key)
        existing_submission_ids.add(record.get("submissionId"))
        existing_submissions.append(record)

    existing_holds = {record.get("submissionId") for record in query_all_by_pk(table, "PAYMENT_HOLD")}
    missing_holds = [record for record in payment_hold_rows(spreadsheet) if record.get("submissionId") not in existing_holds]

    existing_processed = {record.get("submissionId") for record in query_all_by_pk(table, "PROCESSED_PAYMENT")}
    missing_processed = [
        record for record in processed_payment_rows(spreadsheet)
        if record.get("submissionId") not in existing_processed
    ]

    if apply:
        for record in missing_submissions:
            put_if_missing(table, record)
        for record in missing_holds:
            put_if_missing(table, record)
        for record in missing_processed:
            put_if_missing(table, record)

    return {
        "apply": apply,
        "missing_submissions": len(missing_submissions),
        "missing_submissions_by_source": dict(Counter(record.get("source", "") for record in missing_submissions)),
        "missing_submissions_by_title": dict(Counter(record.get("submissionTitle", "") for record in missing_submissions)),
        "missing_payment_holds": len(missing_holds),
        "missing_processed_payments": len(missing_processed),
    }


def main():
    parser = argparse.ArgumentParser(description="Backfill only Google Sheet rows missing from live DynamoDB.")
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--spreadsheet", default="Forms Submissions")
    parser.add_argument("--table", default="sotf-submissions")
    parser.add_argument("--region", default="us-west-2")
    parser.add_argument("--apply", action="store_true", help="Write missing records. Without this, only reports.")
    args = parser.parse_args()

    if not Path(args.credentials).exists():
        raise SystemExit(f"Credentials file not found: {args.credentials}")

    result = backfill_missing_data(args.credentials, args.spreadsheet, args.table, args.region, args.apply)
    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
