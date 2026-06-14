#!/usr/bin/env python3
import json


ACCOUNT_ID = "470065668628"
REGION = "us-west-2"
TABLE_NAMES = ("sotf-submissions-dev", "sotf-submissions")
TABLE_ARNS = [
    f"arn:aws:dynamodb:{REGION}:{ACCOUNT_ID}:table/{table_name}"
    for table_name in TABLE_NAMES
]


def main() -> None:
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:Query",
                ],
                "Resource": TABLE_ARNS,
            }
        ],
    }
    print(json.dumps(policy, indent=2))


if __name__ == "__main__":
    main()
