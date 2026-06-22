#!/usr/bin/env python3
"""Backfill Motor Show submissions with details recovered from payment holds."""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key

UPDATED_BY = "motor-show-detail-backfill"


def json_default(value):
    if isinstance(value, Decimal):
        if value % 1 == 0:
            return int(value)
        return float(value)
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def query_payment_holds(table_name: str, region: str) -> list[dict]:
    table = boto3.resource("dynamodb", region_name=region).Table(table_name)
    items: list[dict] = []
    last_key = None

    while True:
        kwargs = {"KeyConditionExpression": Key("pk").eq("PAYMENT_HOLD")}
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        result = table.query(**kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break

    return items


def query_submissions(table_name: str, region: str) -> list[dict]:
    table = boto3.resource("dynamodb", region_name=region).Table(table_name)
    items: list[dict] = []
    last_key = None

    while True:
        kwargs = {"KeyConditionExpression": Key("pk").eq("SUBMISSION")}
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        result = table.query(**kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break

    return items


def normalized_email(value) -> str:
    return str(value or "").strip().lower()


def is_pre_cutoff_motor_show_submission(submission: dict, cutoff: str) -> bool:
    title = str(submission.get("submissionTitle") or "")
    submitted_at = str(submission.get("submittedAt") or "")
    return title == "Motor Show Event" and bool(submitted_at) and submitted_at[:10] < cutoff


def motor_show_hold_form_data(hold: dict) -> dict | None:
    payload = hold.get("payload") or {}
    form_data = payload.get("formData") or {}
    if payload.get("type") == "motorShowOrder" or form_data.get("type") == "motorShowOrder":
        return form_data
    return None


def hold_row_number(hold: dict) -> int:
    raw_data = hold.get("rawData") or {}
    try:
        return int(raw_data.get("rowNumber") or 0)
    except (TypeError, ValueError):
        return 0


def vehicle_key(hold: dict) -> tuple[str, str, str]:
    form_data = motor_show_hold_form_data(hold) or {}
    return (
        str(form_data.get("year") or "").strip().lower(),
        str(form_data.get("make") or "").strip().lower(),
        str(form_data.get("model") or "").strip().lower(),
    )


def vehicle_group_key(hold: dict) -> tuple[str, str]:
    form_data = motor_show_hold_form_data(hold) or {}
    return (
        str(form_data.get("year") or "").strip().lower(),
        str(form_data.get("make") or "").strip().lower(),
    )


def build_holds_by_email(payment_holds: list[dict], cutoff: str) -> dict[str, list[dict]]:
    lookup: dict[str, list[dict]] = {}
    for hold in payment_holds:
        form_data = motor_show_hold_form_data(hold)
        if not form_data:
            continue
        created_at = str(hold.get("createdAt") or "")
        if created_at and created_at[:10] >= cutoff:
            continue
        email = normalized_email(form_data.get("email"))
        if not email:
            continue
        lookup.setdefault(email, []).append(hold)
    for holds in lookup.values():
        holds.sort(key=lambda item: (hold_row_number(item), str(item.get("createdAt") or ""), str(item.get("submissionId") or "")))
    return lookup


def enrich_submission(submission: dict, hold: dict) -> dict:
    form_data = dict(motor_show_hold_form_data(hold) or {})
    first_name = str(form_data.get("firstName") or "").strip()
    last_name = str(form_data.get("lastName") or "").strip()
    full_name = " ".join(part for part in (first_name, last_name) if part).strip()
    raw_data = {
        **form_data,
        "submission_id": submission.get("submissionId"),
        "payment_hold_id": hold.get("submissionId") or hold.get("sk"),
        "payment_hold_created_at": hold.get("createdAt", ""),
    }

    return {
        **submission,
        "name": full_name or submission.get("name", ""),
        "email": form_data.get("email") or submission.get("email", ""),
        "phone": form_data.get("phone") or submission.get("phone", ""),
        "amount": form_data.get("grandTotal", form_data.get("total", submission.get("amount"))),
        "source": "motorShowOrder",
        "rawData": raw_data,
        "updatedBy": UPDATED_BY,
    }


def choose_holds_for_email(submissions: list[dict], holds: list[dict]) -> list[dict | None]:
    if not submissions:
        return []

    if len(submissions) == 1:
        return [max(holds, key=lambda item: (hold_row_number(item), str(item.get("createdAt") or ""), str(item.get("submissionId") or "")))] if holds else [None]

    grouped: dict[tuple[str, str], list[dict]] = {}
    for hold in holds:
        grouped.setdefault(vehicle_group_key(hold), []).append(hold)

    distinct_holds = []
    for grouped_holds in grouped.values():
        sorted_group = sorted(grouped_holds, key=hold_row_number)
        distinct_holds.append(sorted_group[1] if len(sorted_group) > 1 else sorted_group[0])
    distinct_holds.sort(key=hold_row_number)

    if len(distinct_holds) < len(submissions):
        return [None for _ in submissions]

    return distinct_holds[:len(submissions)]


def build_backfill_plan(submissions: list[dict], payment_holds: list[dict], cutoff: str) -> dict:
    holds_by_email = build_holds_by_email(payment_holds, cutoff)
    eligible_by_email: dict[str, list[dict]] = {}
    skipped = []

    for submission in submissions:
        if not is_pre_cutoff_motor_show_submission(submission, cutoff):
            continue
        email = normalized_email(submission.get("email"))
        if not email:
            skipped.append({"submissionId": submission.get("submissionId"), "reason": "missing email"})
            continue
        eligible_by_email.setdefault(email, []).append(submission)

    updates = []
    for email, email_submissions in eligible_by_email.items():
        email_submissions.sort(key=lambda item: str(item.get("submittedAt") or ""))
        holds = holds_by_email.get(email, [])
        if not holds:
            for submission in email_submissions:
                skipped.append({"submissionId": submission.get("submissionId"), "email": email, "reason": "no matching payment hold"})
            continue
        chosen_holds = choose_holds_for_email(email_submissions, holds)
        for submission, hold in zip(email_submissions, chosen_holds):
            if not hold:
                skipped.append({"submissionId": submission.get("submissionId"), "email": email, "reason": "ambiguous duplicate payment holds"})
                continue
            updates.append({
                "submissionId": submission.get("submissionId"),
                "email": email,
                "original": submission,
                "paymentHold": hold,
                "updated": enrich_submission(submission, hold),
            })

    return {
        "matched": len(updates),
        "skipped": skipped,
        "updates": updates,
    }


def backfill_submissions(submissions: list[dict], payment_holds: list[dict], cutoff: str) -> tuple[list[dict], int]:
    plan = build_backfill_plan(submissions, payment_holds, cutoff)
    updates_by_id = {item["submissionId"]: item["updated"] for item in plan["updates"]}
    for submission in submissions:
        updates_by_id.setdefault(submission.get("submissionId"), submission)
    return [updates_by_id.get(submission.get("submissionId"), submission) for submission in submissions], plan["matched"]


def update_live_submission(table_name: str, region: str, updated_submission: dict):
    table = boto3.resource("dynamodb", region_name=region).Table(table_name)
    table.update_item(
        Key={"pk": updated_submission["pk"], "sk": updated_submission["sk"]},
        UpdateExpression=(
            "SET #name = :name, #email = :email, #phone = :phone, "
            "#amount = :amount, #source = :source, #rawData = :rawData, "
            "#updatedAt = :updatedAt, #updatedBy = :updatedBy"
        ),
        ConditionExpression="attribute_exists(pk) AND attribute_exists(sk) AND #submissionTitle = :title",
        ExpressionAttributeNames={
            "#name": "name",
            "#email": "email",
            "#phone": "phone",
            "#amount": "amount",
            "#source": "source",
            "#rawData": "rawData",
            "#updatedAt": "updatedAt",
            "#updatedBy": "updatedBy",
            "#submissionTitle": "submissionTitle",
        },
        ExpressionAttributeValues={
            ":name": updated_submission.get("name", ""),
            ":email": updated_submission.get("email", ""),
            ":phone": updated_submission.get("phone", ""),
            ":amount": updated_submission.get("amount"),
            ":source": updated_submission.get("source", ""),
            ":rawData": updated_submission.get("rawData", {}),
            ":updatedAt": datetime.now().isoformat(timespec="seconds"),
            ":updatedBy": UPDATED_BY,
            ":title": "Motor Show Event",
        },
    )


def backup_existing(path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    backup_path = path.with_suffix(f"{path.suffix}.bak.{timestamp}")
    backup_path.write_text(path.read_text())
    return backup_path


def write_report(plan: dict, report_dir: Path) -> Path:
    report_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    report_path = report_dir / f"motor_show_detail_backfill_{timestamp}.json"
    report_path.write_text(json.dumps(plan, indent=2, sort_keys=True, default=json_default))
    return report_path


def main():
    parser = argparse.ArgumentParser(description="Backfill Motor Show details from live DynamoDB payment holds")
    parser.add_argument("--table", default="sotf-submissions")
    parser.add_argument("--region", default="us-west-2")
    parser.add_argument("--input", default="backend/.local/submissions.json")
    parser.add_argument("--cutoff", default="2026-06-15")
    parser.add_argument("--report-dir", default="backend/.local")
    parser.add_argument("--apply-local", action="store_true")
    parser.add_argument("--apply-live", action="store_true")
    args = parser.parse_args()

    submissions_path = Path(args.input)
    payment_holds = query_payment_holds(args.table, args.region)
    live_submissions = query_submissions(args.table, args.region)
    plan = build_backfill_plan(live_submissions, payment_holds, args.cutoff)
    report_path = write_report(plan, Path(args.report_dir))

    print(f"Matched {plan['matched']} live Motor Show submissions before {args.cutoff}")
    print(f"Skipped {len(plan['skipped'])} submissions")
    print(f"Wrote backfill report to {report_path}")

    if args.apply_local:
        local_submissions = json.loads(submissions_path.read_text() or "[]")
        backfilled, updated = backfill_submissions(local_submissions, payment_holds, args.cutoff)
        backup_path = backup_existing(submissions_path)
        submissions_path.write_text(json.dumps(backfilled, indent=2, sort_keys=True, default=json_default))
        print(f"Backed up existing local submissions to {backup_path}")
        print(f"Wrote {updated} backfilled local submissions to {submissions_path}")

    if args.apply_live:
        for update in plan["updates"]:
            update_live_submission(args.table, args.region, update["updated"])
        print(f"Updated {len(plan['updates'])} live DynamoDB submissions in {args.table}")

    if not args.apply_local and not args.apply_live:
        print("Dry run only; pass --apply-local and/or --apply-live to write changes")


if __name__ == "__main__":
    main()
