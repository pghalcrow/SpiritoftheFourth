#!/usr/bin/env python3
import argparse
import os

import boto3
from boto3.dynamodb.conditions import Key

from backend.shared.submissions_repository import SubmissionsRepository


OLD_TITLES = {
    "New Volunteer Request",
}
NEW_TITLE = "Volunteer Request"


def query_all_submissions(table):
    items = []
    last_key = None
    while True:
        kwargs = {"KeyConditionExpression": Key("pk").eq("SUBMISSION")}
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        result = table.query(**kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            return items


def main():
    parser = argparse.ArgumentParser(description="Rename stored volunteer submission titles.")
    parser.add_argument("--table", default=os.environ.get("SUBMISSIONS_TABLE", "sotf-submissions"))
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-west-2"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    table = boto3.resource("dynamodb", region_name=args.region).Table(args.table)
    repo = SubmissionsRepository(table=table)
    submissions = query_all_submissions(table)
    matches = [item for item in submissions if item.get("submissionTitle") in OLD_TITLES]

    updated = 0
    for item in matches:
        if args.dry_run:
            continue
        result = table.update_item(
            Key={"pk": item["pk"], "sk": item["sk"]},
            UpdateExpression="SET #submissionTitle = :submissionTitle",
            ExpressionAttributeNames={"#submissionTitle": "submissionTitle"},
            ExpressionAttributeValues={":submissionTitle": NEW_TITLE},
            ReturnValues="ALL_NEW",
        )
        repo.reindex_submission(result["Attributes"])
        updated += 1

    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"{mode}: scanned={len(submissions)} matches={len(matches)} updated={updated}")


if __name__ == "__main__":
    main()
