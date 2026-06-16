from datetime import datetime
import os
from backend.shared.time_utils import pacific_now_iso

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None
    ClientError = None


def _now_iso():
    return pacific_now_iso()


class SubmissionsRepository:
    def __init__(self, table=None, table_name=None):
        if table is not None:
            self.table = table
            return

        if boto3 is None:
            raise ImportError("boto3 is required when a DynamoDB table is not provided")

        resolved_table_name = table_name or os.environ["SUBMISSIONS_TABLE"]
        self.table = boto3.resource("dynamodb").Table(resolved_table_name)

    def create_submission(self, record):
        self.table.put_item(Item=record)
        return record

    def create_submission_if_missing(self, record):
        if self._find_submission_by_id(record["submissionId"]):
            return False

        try:
            self.table.put_item(
                Item=record,
                ConditionExpression="attribute_not_exists(pk)",
            )
            return True
        except Exception as error:
            if self._is_conditional_check_failed(error):
                return False
            raise

    def save_payment_hold(self, submission_id, payload):
        created_at = _now_iso()
        record = {
            "pk": "PAYMENT_HOLD",
            "sk": submission_id,
            "recordType": "payment_hold",
            "submissionId": submission_id,
            "payload": payload,
            "createdAt": created_at,
            "updatedAt": created_at,
        }
        self.table.put_item(Item=record)
        return record

    def get_payment_hold(self, submission_id):
        result = self.table.get_item(Key={"pk": "PAYMENT_HOLD", "sk": submission_id})
        item = result.get("Item")
        return item.get("payload", {}) if item else {}

    def is_processed_payment(self, submission_id):
        result = self.table.get_item(Key={"pk": "PROCESSED_PAYMENT", "sk": submission_id})
        return "Item" in result

    def mark_processed_payment(self, submission_id, provider, metadata=None):
        metadata = metadata or {}
        processed_at = _now_iso()
        record = {
            "pk": "PROCESSED_PAYMENT",
            "sk": submission_id,
            "recordType": "processed_payment",
            "submissionId": submission_id,
            "provider": provider,
            "providerSessionId": metadata.get("sessionId", ""),
            "processedAt": processed_at,
            "metadata": metadata,
        }

        try:
            self.table.put_item(
                Item=record,
                ConditionExpression="attribute_not_exists(pk)",
            )
            return True
        except Exception as error:
            if self._is_conditional_check_failed(error):
                return False
            raise

    def claim_payment_processing(self, submission_id, provider, metadata=None):
        metadata = metadata or {}
        claimed_at = _now_iso()
        record = {
            "pk": "PROCESSED_PAYMENT",
            "sk": submission_id,
            "recordType": "processed_payment",
            "submissionId": submission_id,
            "provider": provider,
            "providerSessionId": metadata.get("sessionId", metadata.get("orderId", "")),
            "status": "processing",
            "claimedAt": claimed_at,
            "processedAt": "",
            "metadata": metadata,
        }
        try:
            self.table.put_item(
                Item=record,
                ConditionExpression="attribute_not_exists(pk)",
            )
            return True
        except Exception as error:
            if self._is_conditional_check_failed(error):
                return False
            raise

    def complete_payment_processing(self, submission_id, provider, metadata=None):
        metadata = metadata or {}
        processed_at = _now_iso()
        result = self.table.update_item(
            Key={"pk": "PROCESSED_PAYMENT", "sk": submission_id},
            UpdateExpression=(
                "SET #status = :status, #provider = :provider, "
                "#providerSessionId = :providerSessionId, #processedAt = :processedAt, #metadata = :metadata"
            ),
            ConditionExpression="attribute_exists(pk) AND attribute_exists(sk)",
            ExpressionAttributeNames={
                "#status": "status",
                "#provider": "provider",
                "#providerSessionId": "providerSessionId",
                "#processedAt": "processedAt",
                "#metadata": "metadata",
            },
            ExpressionAttributeValues={
                ":status": "processed",
                ":provider": provider,
                ":providerSessionId": metadata.get("sessionId", metadata.get("orderId", "")),
                ":processedAt": processed_at,
                ":metadata": metadata,
            },
            ReturnValues="ALL_NEW",
        )
        return result["Attributes"]

    def release_payment_processing(self, submission_id):
        self.table.delete_item(
            Key={"pk": "PROCESSED_PAYMENT", "sk": submission_id},
            ConditionExpression="attribute_exists(pk) AND attribute_exists(sk)",
        )

    def get_runtime_settings(self):
        result = self.table.get_item(Key={"pk": "SETTINGS", "sk": "RUNTIME"})
        item = result.get("Item")
        if not item:
            return {"testMode": False, "updatedBy": "", "updatedAt": ""}
        return {
            "testMode": bool(item.get("testMode", False)),
            "updatedBy": item.get("updatedBy", ""),
            "updatedAt": item.get("updatedAt", ""),
        }

    def set_runtime_test_mode(self, enabled, updated_by):
        updated_at = _now_iso()
        record = {
            "pk": "SETTINGS",
            "sk": "RUNTIME",
            "recordType": "runtime_settings",
            "testMode": bool(enabled),
            "updatedBy": updated_by,
            "updatedAt": updated_at,
        }
        self.table.put_item(Item=record)
        return {
            "testMode": record["testMode"],
            "updatedBy": record["updatedBy"],
            "updatedAt": record["updatedAt"],
        }

    def list_submissions(self, limit=100):
        items = []
        last_key = None

        while len(items) < limit:
            result = self._query_submissions(
                scan_index_forward=False,
                limit=limit - len(items),
                exclusive_start_key=last_key,
            )
            items.extend(result.get("Items", []))
            last_key = result.get("LastEvaluatedKey")
            if not last_key:
                break

        return {"items": items, "lastEvaluatedKey": last_key}

    def update_submission_admin_fields(
        self,
        submission_id,
        status=None,
        assigned_to=None,
        notes=None,
        updated_by=None,
        payment_received=None,
    ):
        submission = self._find_submission_by_id(submission_id)
        if submission is None:
            raise KeyError(f"Submission not found: {submission_id}")

        update_fields = {
            "#updatedAt": ("updatedAt", ":updatedAt", _now_iso()),
            "#updatedBy": ("updatedBy", ":updatedBy", updated_by),
        }
        if status is not None:
            update_fields["#status"] = ("status", ":status", status)
        if assigned_to is not None:
            update_fields["#assignedTo"] = ("assignedTo", ":assignedTo", assigned_to)
        if notes is not None:
            update_fields["#notes"] = ("notes", ":notes", notes)
        if payment_received is not None:
            update_fields["#paymentReceived"] = ("paymentReceived", ":paymentReceived", bool(payment_received))

        try:
            result = self.table.update_item(
                Key={"pk": submission["pk"], "sk": submission["sk"]},
                UpdateExpression="SET " + ", ".join(
                    f"{name_placeholder} = {value_placeholder}"
                    for name_placeholder, (_, value_placeholder, _) in update_fields.items()
                ),
                ConditionExpression="attribute_exists(pk) AND attribute_exists(sk)",
                ExpressionAttributeNames={
                    name_placeholder: field_name
                    for name_placeholder, (field_name, _, _) in update_fields.items()
                },
                ExpressionAttributeValues={
                    value_placeholder: value
                    for _, value_placeholder, value in update_fields.values()
                },
                ReturnValues="ALL_NEW",
            )
        except Exception as error:
            if self._is_conditional_check_failed(error):
                raise KeyError(f"Submission not found: {submission_id}") from error
            raise
        return result["Attributes"]

    def delete_submission(self, submission_id):
        submission = self._find_submission_by_id(submission_id)
        if submission is None:
            raise KeyError(f"Submission not found: {submission_id}")

        try:
            self.table.delete_item(
                Key={"pk": submission["pk"], "sk": submission["sk"]},
                ConditionExpression="attribute_exists(pk) AND attribute_exists(sk)",
            )
        except Exception as error:
            if self._is_conditional_check_failed(error):
                raise KeyError(f"Submission not found: {submission_id}") from error
            raise
        return submission

    def _find_submission_by_id(self, submission_id):
        last_key = None

        while True:
            result = self._query_submissions(exclusive_start_key=last_key)
            for item in result.get("Items", []):
                if item.get("submissionId") == submission_id:
                    return item

            last_key = result.get("LastEvaluatedKey")
            if not last_key:
                break
        return None

    def _query_submissions(self, scan_index_forward=None, limit=None, exclusive_start_key=None):
        kwargs = {
            "KeyConditionExpression": "pk = :pk",
            "ExpressionAttributeValues": {":pk": "SUBMISSION"},
        }
        if scan_index_forward is not None:
            kwargs["ScanIndexForward"] = scan_index_forward
        if limit is not None:
            kwargs["Limit"] = limit
        if exclusive_start_key is not None:
            kwargs["ExclusiveStartKey"] = exclusive_start_key
        return self.table.query(**kwargs)

    def _is_conditional_check_failed(self, error):
        if ClientError is not None and isinstance(error, ClientError):
            code = error.response.get("Error", {}).get("Code")
            return code == "ConditionalCheckFailedException"
        return "ConditionalCheckFailedException" in str(error)
