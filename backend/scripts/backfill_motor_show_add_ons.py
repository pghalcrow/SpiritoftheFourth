#!/usr/bin/env python3
"""
Backfill the "Add-Ons" column in the "Event Submissions" Google Sheet
for existing motor show orders by reading add-on data from DynamoDB.

Usage:
    python -m backend.scripts.backfill_motor_show_add_ons \
        --credentials /path/to/service-account.json \
        --spreadsheet "Forms Submissions" \
        --table <dynamodb-table-name> \
        [--dry-run]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key


MOTOR_SHOW_SOURCES = {"motorShowOrder", "Motor Show Event"}
ADD_ONS_COLUMN_HEADER = "Add-Ons"

ADD_ON_FIELDS = [
    ("additionalPlaques", "Additional Plaque"),
    ("additionalSmall", "T-Shirt Small"),
    ("additionalMedium", "T-Shirt Medium"),
    ("additionalLarge", "T-Shirt Large"),
    ("additionalXLarge", "T-Shirt XL"),
    ("additionalXXLarge", "T-Shirt 2XL"),
    ("additionalXXXLarge", "T-Shirt 3XL"),
]


def _positive_int(value):
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def format_add_ons(raw_data: dict) -> str:
    parts = []
    combo_size = raw_data.get("comboSize")
    if combo_size:
        parts.append(f"T-Shirt & Plaque Bundle - {combo_size}")
    for field, label in ADD_ON_FIELDS:
        qty = _positive_int(raw_data.get(field))
        if qty:
            parts.append(f"{label} x{qty}")
    return ", ".join(parts)


def scan_motor_show_submissions(table_name: str) -> list[dict]:
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)

    items = []
    last_key = None
    while True:
        kwargs = {
            "KeyConditionExpression": Key("pk").eq("SUBMISSION"),
            "FilterExpression": "#src IN (:s1, :s2)",
            "ExpressionAttributeNames": {"#src": "source"},
            "ExpressionAttributeValues": {
                ":s1": "motorShowOrder",
                ":s2": "Motor Show Event",
            },
        }
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        result = table.query(**kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break

    print(f"Found {len(items)} motor show submissions in DynamoDB")
    return items


def build_lookup(submissions: list[dict]) -> dict[str, list[dict]]:
    """Build email -> [submission, ...] lookup from DynamoDB records."""
    lookup: dict[str, list[dict]] = {}
    for item in submissions:
        email = (item.get("email") or "").lower().strip()
        if email:
            lookup.setdefault(email, []).append(item)
    return lookup


def backfill(credentials_path: str, spreadsheet_name: str, table_name: str, dry_run: bool = False):
    import gspread

    gc = gspread.service_account(filename=credentials_path)
    spreadsheet = gc.open(spreadsheet_name)
    worksheet = spreadsheet.worksheet("Event Submissions")

    all_values = worksheet.get_all_values()
    if not all_values:
        print("Sheet is empty — nothing to backfill")
        return

    headers = all_values[0]

    # Add "Add-Ons" header column if not present
    if ADD_ONS_COLUMN_HEADER not in headers:
        col_index = len(headers) + 1  # 1-based for gspread
        print(f"Adding '{ADD_ONS_COLUMN_HEADER}' header at column {col_index}")
        if not dry_run:
            worksheet.update_cell(1, col_index, ADD_ONS_COLUMN_HEADER)
        headers.append(ADD_ONS_COLUMN_HEADER)
        # Pad existing rows so indices align
        for row in all_values[1:]:
            row.append("")

    add_ons_col = headers.index(ADD_ONS_COLUMN_HEADER)  # 0-based
    add_ons_col_gspread = add_ons_col + 1  # 1-based for gspread

    email_col = next((i for i, h in enumerate(headers) if h.lower() == "email"), None)
    name_col = next((i for i, h in enumerate(headers) if h.lower() == "name"), None)
    form_col = next((i for i, h in enumerate(headers) if h.lower() in ("form", "submissions")), None)

    if email_col is None:
        raise SystemExit("Could not find Email column in sheet headers")

    submissions = scan_motor_show_submissions(table_name)
    email_lookup = build_lookup(submissions)

    updated = 0
    skipped = 0

    for row_offset, row in enumerate(all_values[1:], start=2):  # row_offset is 1-based sheet row
        form_value = row[form_col].lower() if form_col is not None and form_col < len(row) else ""
        if "motor show" not in form_value:
            continue

        email = row[email_col].lower().strip() if email_col < len(row) else ""
        name = row[name_col].strip() if name_col is not None and name_col < len(row) else ""

        existing_add_ons = row[add_ons_col].strip() if add_ons_col < len(row) else ""
        if existing_add_ons:
            print(f"  Row {row_offset} ({name} / {email}): already has add-ons, skipping")
            skipped += 1
            continue

        matches = email_lookup.get(email, [])
        if not matches:
            print(f"  Row {row_offset} ({name} / {email}): no DynamoDB match found")
            skipped += 1
            continue

        # If multiple DynamoDB records match by email, prefer one with the same name
        match = next(
            (m for m in matches if (m.get("name") or "").strip().lower() == name.lower()),
            matches[0],
        )

        raw_data = match.get("rawData") or {}
        add_ons_str = format_add_ons(raw_data)

        print(f"  Row {row_offset} ({name} / {email}): {add_ons_str or '(no add-ons)'}")
        if not dry_run:
            worksheet.update_cell(row_offset, add_ons_col_gspread, add_ons_str)
        updated += 1

    print(f"\nDone — updated: {updated}, skipped: {skipped}" + (" [dry run]" if dry_run else ""))


def main():
    parser = argparse.ArgumentParser(description="Backfill motor show add-ons in Google Sheet")
    parser.add_argument("--credentials", required=True, help="Path to Google service account JSON")
    parser.add_argument("--spreadsheet", default="Forms Submissions", help="Google Sheet name")
    parser.add_argument("--table", required=True, help="DynamoDB table name")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing")
    args = parser.parse_args()

    if not Path(args.credentials).exists():
        raise SystemExit(f"Credentials file not found: {args.credentials}")

    backfill(args.credentials, args.spreadsheet, args.table, args.dry_run)


if __name__ == "__main__":
    main()
