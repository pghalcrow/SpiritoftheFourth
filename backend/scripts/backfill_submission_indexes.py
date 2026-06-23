#!/usr/bin/env python3
import argparse
import os

import boto3
from boto3.dynamodb.conditions import Key

from backend.shared.submissions_repository import SubmissionsRepository


INDEX_PARTITIONS = [
    "SUBMISSION_ID",
    *[f"SUBMISSION_GROUP#{group}" for group in SubmissionsRepository.SUBMISSION_GROUPS],
]


def query_all(table, pk):
    items = []
    last_key = None
    while True:
        kwargs = {"KeyConditionExpression": Key("pk").eq(pk)}
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        result = table.query(**kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            return items


def delete_items(table, items, dry_run=False):
    if dry_run:
        return len(items)

    with table.batch_writer() as batch:
        for item in items:
            batch.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
    return len(items)


def put_items(table, items, dry_run=False):
    if dry_run:
        return len(items)

    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=item)
    return len(items)


def build_index_items(repo, submission):
    repo._prepare_submission_record(submission)
    items = [{
        "pk": "SUBMISSION_ID",
        "sk": submission["submissionId"],
        "recordType": "submission_lookup",
        "submissionId": submission["submissionId"],
        "submissionPk": submission.get("pk"),
        "submissionSk": submission.get("sk"),
    }]

    groups = submission.get("submissionGroups") or repo.submission_groups(submission)
    for group in groups:
        items.append({
            **repo._summarize_submission(submission),
            "pk": repo._submission_group_pk(group),
            "sk": submission.get("sk"),
            "recordType": "submission_group",
            "group": group,
            "submissionId": submission["submissionId"],
            "submissionPk": submission.get("pk"),
            "submissionSk": submission.get("sk"),
            "submissionGroups": groups,
        })
    return items


def main():
    parser = argparse.ArgumentParser(description="Rebuild submission lookup and category index records.")
    parser.add_argument("--table", default=os.environ.get("SUBMISSIONS_TABLE", "sotf-submissions"))
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-west-2"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    table = boto3.resource("dynamodb", region_name=args.region).Table(args.table)
    repo = SubmissionsRepository(table=table)

    submissions = query_all(table, "SUBMISSION")
    stale_index_items = []
    for partition in INDEX_PARTITIONS:
        stale_index_items.extend(query_all(table, partition))

    new_index_items = []
    for submission in submissions:
        if submission.get("recordType") == "submission" and submission.get("submissionId"):
            new_index_items.extend(build_index_items(repo, submission))

    deleted = delete_items(table, stale_index_items, dry_run=args.dry_run)
    written = put_items(table, new_index_items, dry_run=args.dry_run)

    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"{mode}: submissions={len(submissions)} deleted_index_items={deleted} written_index_items={written}")


if __name__ == "__main__":
    main()
