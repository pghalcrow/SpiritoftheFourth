#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from backend.shared.submissions_mapping import (
    map_payment_hold_row,
    map_processed_payment_row,
    map_sheet_submission_row,
)
from backend.shared.submissions_repository import SubmissionsRepository


SUBMISSION_WORKSHEETS = {"Sheet1", "Event Submissions", "Golf Event"}
HOLD_WORKSHEETS = {"Event Hold", "Golf Event Hold"}
PROCESSED_WORKSHEETS = {"Processed Submissions"}


def import_spreadsheet(credentials_path, spreadsheet_name, repo, dry_run=False):
    import gspread

    gc = gspread.service_account(filename=credentials_path)
    spreadsheet = gc.open(spreadsheet_name)
    counts = {"submission": 0, "payment_hold": 0, "processed_payment": 0, "skipped": 0}

    for worksheet in spreadsheet.worksheets():
        title = worksheet.title
        rows = worksheet.get_all_values()
        if not rows:
            continue

        if title in SUBMISSION_WORKSHEETS:
            import_submission_rows(title, rows, repo, counts, dry_run)
        elif title in HOLD_WORKSHEETS:
            import_hold_rows(title, rows, repo, counts, dry_run)
        elif title in PROCESSED_WORKSHEETS:
            import_processed_rows(title, rows, repo, counts, dry_run)

    return counts


def import_submission_rows(title, rows, repo, counts, dry_run):
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
            counts["skipped"] += 1
            continue
        record = map_sheet_submission_row(title, start_row + offset, headers, values)
        if not dry_run:
            repo.create_submission_if_missing(record)
        counts["submission"] += 1


def import_hold_rows(title, rows, repo, counts, dry_run):
    for row_number, values in enumerate(rows[1:], start=2):
        if len(values) < 2 or not values[0]:
            counts["skipped"] += 1
            continue
        record = map_payment_hold_row(title, row_number, values[0], values[1])
        if not dry_run:
            repo.table.put_item(Item=record)
        counts["payment_hold"] += 1


def import_processed_rows(title, rows, repo, counts, dry_run):
    for row_number, values in enumerate(rows, start=1):
        if not values or not values[0]:
            counts["skipped"] += 1
            continue
        record = map_processed_payment_row(title, row_number, values)
        if not dry_run:
            repo.table.put_item(Item=record)
        counts["processed_payment"] += 1


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
