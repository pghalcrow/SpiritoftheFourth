#!/usr/bin/env python3
"""Import live DynamoDB submissions into the local JSON submission store."""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key


def json_default(value):
    if isinstance(value, Decimal):
        if value % 1 == 0:
            return int(value)
        return float(value)
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


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

    return sorted(
        items,
        key=lambda item: item.get("submittedAt") or item.get("createdAt") or "",
        reverse=True,
    )


def backup_existing(path: Path) -> Path | None:
    if not path.exists():
        return None

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    backup_path = path.with_suffix(f"{path.suffix}.bak.{timestamp}")
    backup_path.write_text(path.read_text())
    return backup_path


def main():
    parser = argparse.ArgumentParser(description="Import live submissions into backend/.local/submissions.json")
    parser.add_argument("--table", default="sotf-submissions", help="DynamoDB table to read")
    parser.add_argument("--region", default="us-west-2", help="AWS region containing the DynamoDB table")
    parser.add_argument(
        "--output",
        default="backend/.local/submissions.json",
        help="Local JSON file to overwrite",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report what would be imported without writing")
    args = parser.parse_args()

    output_path = Path(args.output)
    submissions = query_submissions(args.table, args.region)
    print(f"Found {len(submissions)} submissions in {args.table} ({args.region})")

    if args.dry_run:
        print(f"Dry run only; {output_path} was not changed")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path = backup_existing(output_path)
    output_path.write_text(json.dumps(submissions, indent=2, sort_keys=True, default=json_default))

    if backup_path:
        print(f"Backed up existing local submissions to {backup_path}")
    print(f"Imported {len(submissions)} submissions into {output_path}")


if __name__ == "__main__":
    main()
