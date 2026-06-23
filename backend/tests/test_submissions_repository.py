import unittest

from backend.shared.submissions_repository import SubmissionsRepository


class FakeTable:
    def __init__(self):
        self.items = {}
        self.page_size = None
        self.delete_before_update_keys = set()
        self.query_pks = []

    def put_item(self, **kwargs):
        item = kwargs["Item"]
        key = (item["pk"], item["sk"])
        condition = kwargs.get("ConditionExpression")
        if condition and key in self.items:
            raise Exception("ConditionalCheckFailedException")
        self.items[key] = item
        return {"ResponseMetadata": {"HTTPStatusCode": 200}}

    def get_item(self, **kwargs):
        key = (kwargs["Key"]["pk"], kwargs["Key"]["sk"])
        item = self.items.get(key)
        return {"Item": item} if item else {}

    def update_item(self, **kwargs):
        key = (kwargs["Key"]["pk"], kwargs["Key"]["sk"])
        if key in self.delete_before_update_keys:
            self.items.pop(key, None)

        condition = kwargs.get("ConditionExpression")
        if condition and key not in self.items:
            raise Exception("ConditionalCheckFailedException")

        item = self.items.setdefault(key, {"pk": key[0], "sk": key[1]})
        names = kwargs["ExpressionAttributeNames"]
        values = kwargs["ExpressionAttributeValues"]
        for placeholder, field_name in names.items():
            value_key = ":" + placeholder.lstrip("#")
            if value_key in values:
                item[field_name] = values[value_key]
        return {"Attributes": item}

    def delete_item(self, **kwargs):
        key = (kwargs["Key"]["pk"], kwargs["Key"]["sk"])
        condition = kwargs.get("ConditionExpression")
        if condition and key not in self.items:
            raise Exception("ConditionalCheckFailedException")
        self.items.pop(key, None)
        return {}

    def query(self, **kwargs):
        pk_value = kwargs["ExpressionAttributeValues"][":pk"]
        self.query_pks.append(pk_value)
        rows = [item for (pk, _), item in self.items.items() if pk == pk_value]
        rows.sort(key=lambda row: row["sk"], reverse=kwargs.get("ScanIndexForward") is False)
        if kwargs.get("Select") == "COUNT":
            return {"Count": len(rows)}
        exclusive_start_key = kwargs.get("ExclusiveStartKey")
        if exclusive_start_key:
            start_key = (exclusive_start_key["pk"], exclusive_start_key["sk"])
            for index, item in enumerate(rows):
                if (item["pk"], item["sk"]) == start_key:
                    rows = rows[index + 1:]
                    break

        limit = kwargs.get("Limit") or len(rows)
        if self.page_size is not None:
            limit = min(limit, self.page_size)

        page = rows[:limit]
        result = {"Items": page}
        if len(rows) > limit and page:
            result["LastEvaluatedKey"] = {"pk": page[-1]["pk"], "sk": page[-1]["sk"]}
        return result


class RepositoryTests(unittest.TestCase):
    def setUp(self):
        self.table = FakeTable()
        self.repo = SubmissionsRepository(table=self.table)

    def test_create_submission_and_list(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
        })

        result = self.repo.list_submissions(limit=10)

        self.assertEqual(result["items"][0]["submissionId"], "s1")
        self.assertEqual(result["items"][0]["submissionTitle"], "Volunteer")

    def test_create_submission_if_missing_is_idempotent(self):
        record = {
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
        }

        self.assertTrue(self.repo.create_submission_if_missing(record))
        self.assertFalse(self.repo.create_submission_if_missing({**record, "submissionTitle": "Changed"}))

        result = self.repo.list_submissions(limit=10)
        self.assertEqual(result["items"][0]["submissionTitle"], "Volunteer")

    def test_create_submission_if_missing_blocks_same_submission_id_with_new_sort_key(self):
        first = {
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
        }
        second = {
            **first,
            "sk": "2026-06-05T10:01:00-07:00#s1",
            "submissionTitle": "Volunteer retry",
        }

        self.assertTrue(self.repo.create_submission_if_missing(first))
        self.assertFalse(self.repo.create_submission_if_missing(second))

        result = self.repo.list_submissions(limit=10)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["submissionTitle"], "Volunteer")

    def test_payment_hold_round_trip(self):
        self.repo.save_payment_hold("hold-1", {"formData": {"fullName": "Pat"}})

        payload = self.repo.get_payment_hold("hold-1")

        self.assertEqual(payload["formData"]["fullName"], "Pat")

    def test_processed_payment_idempotency(self):
        self.assertFalse(self.repo.is_processed_payment("p1"))
        self.assertTrue(self.repo.mark_processed_payment("p1", "stripe", {"sessionId": "cs_123"}))
        self.assertTrue(self.repo.is_processed_payment("p1"))
        self.assertFalse(self.repo.mark_processed_payment("p1", "stripe", {"sessionId": "cs_123"}))

    def test_claim_payment_processing_is_atomic(self):
        self.assertTrue(self.repo.claim_payment_processing("p1", "paypal", {"orderId": "order-1"}))
        self.assertFalse(self.repo.claim_payment_processing("p1", "paypal", {"orderId": "order-1"}))

        item = self.table.get_item(Key={"pk": "PROCESSED_PAYMENT", "sk": "p1"})["Item"]
        self.assertEqual(item["status"], "processing")
        self.assertEqual(item["providerSessionId"], "order-1")

    def test_complete_payment_processing_marks_claim_processed(self):
        self.repo.claim_payment_processing("p1", "stripe", {"sessionId": "cs_123"})

        updated = self.repo.complete_payment_processing("p1", "stripe", {"sessionId": "cs_123"})

        self.assertEqual(updated["status"], "processed")
        self.assertEqual(updated["provider"], "stripe")
        self.assertEqual(updated["providerSessionId"], "cs_123")
        self.assertTrue(updated["processedAt"])

    def test_release_payment_processing_allows_retry_claim(self):
        self.assertTrue(self.repo.claim_payment_processing("p1", "stripe", {"sessionId": "cs_123"}))

        self.repo.release_payment_processing("p1")

        self.assertTrue(self.repo.claim_payment_processing("p1", "stripe", {"sessionId": "cs_123"}))

    def test_runtime_settings_default_to_live_mode(self):
        settings = self.repo.get_runtime_settings()

        self.assertFalse(settings["testMode"])

    def test_submission_groups_treat_special_events_as_freedom_club_and_sponsors_as_special_events(self):
        sponsorship = {
            "submissionTitle": "Sponsorship Submission",
            "source": "sponsorshipForm",
            "rawData": {"formType": "sponsorshipForm"},
        }
        special_event = {
            "submissionTitle": "Community Picnic Signup",
            "source": "communityPicnic",
            "rawData": {"eventTitle": "Community Picnic", "pricing": {"pricePerPlayer": 0}},
        }

        self.assertTrue(self.repo.submission_matches_group(special_event, "sponsor"))
        self.assertFalse(self.repo.submission_matches_group(sponsorship, "sponsor"))
        self.assertTrue(self.repo.submission_matches_group(sponsorship, "specialEvents"))
        self.assertFalse(self.repo.submission_matches_group(special_event, "specialEvents"))

    def test_grouped_page_uses_persisted_category_index(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Freedom Club Donation",
            "submittedAt": "2026-06-05T10:00:00-07:00",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
            "paymentProvider": "stripe",
            "rawData": {"eventTitle": "Freedom Club Donation"},
        })
        self.table.query_pks.clear()

        result = self.repo.list_submissions_group_page("sponsor", limit=10)

        self.assertEqual([item["submissionId"] for item in result["items"]], ["s1"])
        self.assertEqual(result["totalCount"], 1)
        self.assertNotIn("SUBMISSION", self.table.query_pks)
        self.assertIn("SUBMISSION_GROUP#sponsor", self.table.query_pks)

    def test_group_all_uses_main_submission_partition(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "submittedAt": "2026-06-05T10:00:00-07:00",
        })
        self.table.query_pks.clear()

        result = self.repo.list_submissions_page(group="all")

        self.assertEqual([item["submissionId"] for item in result["items"]], ["s1"])
        self.assertIn("SUBMISSION", self.table.query_pks)
        self.assertNotIn("SUBMISSION_GROUP#all", self.table.query_pks)

    def test_get_submission_uses_submission_id_lookup_record(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "submittedAt": "2026-06-05T10:00:00-07:00",
        })
        self.table.query_pks.clear()

        submission = self.repo.get_submission("s1")

        self.assertEqual(submission["submissionId"], "s1")
        self.assertNotIn("SUBMISSION", self.table.query_pks)

    def test_runtime_test_mode_round_trip(self):
        updated = self.repo.set_runtime_test_mode(True, "developer")

        self.assertTrue(updated["testMode"])
        self.assertEqual(updated["updatedBy"], "developer")
        self.assertTrue(updated["updatedAt"])
        self.assertTrue(self.repo.get_runtime_settings()["testMode"])

    def test_update_admin_fields(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
        })

        updated = self.repo.update_submission_admin_fields("s1", "Complete", "Patrick", "Done", "admin")

        self.assertEqual(updated["status"], "Complete")
        self.assertEqual(updated["assignedTo"], "Patrick")
        self.assertEqual(updated["notes"], "Done")
        self.assertEqual(updated["updatedBy"], "admin")

    def test_update_admin_fields_can_set_payment_received_without_overwriting_existing_fields(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "New Motor Show Entry — Check Payment",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "In Review",
            "assignedTo": "Patrick",
            "notes": "Waiting for check",
            "paymentReceived": False,
        })

        updated = self.repo.update_submission_admin_fields(
            "s1",
            notes="Check received",
            payment_received=True,
            updated_by="admin",
        )

        self.assertEqual(updated["status"], "In Review")
        self.assertEqual(updated["assignedTo"], "Patrick")
        self.assertEqual(updated["notes"], "Check received")
        self.assertTrue(updated["paymentReceived"])
        self.assertEqual(updated["updatedBy"], "admin")

    def test_list_submissions_collects_items_across_pages_up_to_limit(self):
        self.table.page_size = 2
        for index in range(5):
            submission_id = f"s{index}"
            self.repo.create_submission({
                "pk": "SUBMISSION",
                "sk": f"2026-06-05T10:0{index}:00-07:00#{submission_id}",
                "recordType": "submission",
                "submissionId": submission_id,
                "submissionTitle": f"Submission {index}",
                "name": "Pat",
                "email": "pat@example.com",
                "phone": "555",
                "status": "New",
                "assignedTo": "",
                "notes": "",
            })

        result = self.repo.list_submissions(limit=3)

        self.assertEqual([item["submissionId"] for item in result["items"]], ["s4", "s3", "s2"])
        self.assertEqual(
            result["lastEvaluatedKey"],
            {"pk": "SUBMISSION", "sk": "2026-06-05T10:02:00-07:00#s2"},
        )

    def test_list_submissions_page_returns_one_page_with_summary_rows(self):
        self.table.page_size = 10
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:01:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "submittedAt": "2026-06-05T10:01:00-07:00",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "source": "website",
            "status": "New",
            "assignedTo": "",
            "notes": "",
            "rawData": {
                "formType": "volunteerForm",
                "eventTitle": "Morning Shift",
                "message": "Available morning",
                "headers": ["Large field"],
            },
        })
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s0",
            "recordType": "submission",
            "submissionId": "s0",
            "submissionTitle": "Older",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
            "rawData": {"formType": "volunteerForm", "message": "Older"},
        })

        result = self.repo.list_submissions_page(limit=1, summary_only=True)

        self.assertEqual(result["items"][0]["submissionId"], "s1")
        self.assertEqual(result["items"][0]["rawData"], {
            "formType": "volunteerForm",
            "eventTitle": "Morning Shift",
        })
        self.assertNotIn("message", result["items"][0]["rawData"])
        self.assertEqual(
            result["lastEvaluatedKey"],
            {"pk": "SUBMISSION", "sk": "2026-06-05T10:01:00-07:00#s1"},
        )

    def test_list_submissions_page_uses_exclusive_start_key(self):
        for index in range(3):
            submission_id = f"s{index}"
            self.repo.create_submission({
                "pk": "SUBMISSION",
                "sk": f"2026-06-05T10:0{index}:00-07:00#{submission_id}",
                "recordType": "submission",
                "submissionId": submission_id,
                "submissionTitle": f"Submission {index}",
                "name": "Pat",
                "email": "pat@example.com",
                "phone": "555",
                "status": "New",
                "assignedTo": "",
                "notes": "",
            })

        result = self.repo.list_submissions_page(
            limit=1,
            cursor={"pk": "SUBMISSION", "sk": "2026-06-05T10:02:00-07:00#s2"},
        )

        self.assertEqual([item["submissionId"] for item in result["items"]], ["s1"])

    def test_count_submissions_returns_total_submission_rows(self):
        for index in range(3):
            self.repo.create_submission({
                "pk": "SUBMISSION",
                "sk": f"2026-06-05T10:0{index}:00-07:00#s{index}",
                "recordType": "submission",
                "submissionId": f"s{index}",
                "submissionTitle": f"Submission {index}",
                "name": "Pat",
                "email": "pat@example.com",
                "phone": "555",
                "status": "New",
                "assignedTo": "",
                "notes": "",
            })
        self.table.items[("SETTINGS", "RUNTIME")] = {"pk": "SETTINGS", "sk": "RUNTIME"}

        self.assertEqual(self.repo.count_submissions(), 3)

    def test_get_submission_returns_full_raw_data(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:01:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
            "rawData": {"formType": "volunteerForm", "message": "Available morning"},
        })

        result = self.repo.get_submission("s1")

        self.assertEqual(result["rawData"]["message"], "Available morning")

    def test_tracks_admin_user_password_setup_status(self):
        self.repo.mark_admin_user_password_setup_required("Viewer@Example.com")

        statuses = self.repo.list_admin_user_setup_statuses()

        self.assertTrue(statuses["viewer@example.com"]["passwordSetupRequired"])

        self.repo.mark_admin_user_password_setup_complete("viewer@example.com")

        updated_statuses = self.repo.list_admin_user_setup_statuses()
        self.assertFalse(updated_statuses["viewer@example.com"]["passwordSetupRequired"])

    def test_list_submissions_returns_all_items_by_default(self):
        self.table.page_size = 20
        for index in range(105):
            submission_id = f"s{index}"
            self.repo.create_submission({
                "pk": "SUBMISSION",
                "sk": f"2026-06-05T10:{index:03d}:00-07:00#{submission_id}",
                "recordType": "submission",
                "submissionId": submission_id,
                "submissionTitle": f"Submission {index}",
                "name": "Pat",
                "email": "pat@example.com",
                "phone": "555",
                "status": "New",
                "assignedTo": "",
                "notes": "",
            })

        result = self.repo.list_submissions()

        self.assertEqual(len(result["items"]), 105)
        self.assertEqual(result["items"][0]["submissionId"], "s104")
        self.assertEqual(result["items"][-1]["submissionId"], "s0")
        self.assertIsNone(result["lastEvaluatedKey"])

    def test_update_admin_fields_finds_submission_on_later_page(self):
        self.table.page_size = 1
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:02:00-07:00#s2",
            "recordType": "submission",
            "submissionId": "s2",
            "submissionTitle": "Later",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
        })
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:01:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Earlier",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
        })

        updated = self.repo.update_submission_admin_fields("s2", "Complete", "Patrick", "Done", "admin")

        self.assertEqual(updated["submissionId"], "s2")
        self.assertEqual(updated["status"], "Complete")

    def test_update_admin_fields_raises_key_error_when_item_disappears_before_update(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
        })
        self.table.delete_before_update_keys.add(("SUBMISSION", "2026-06-05T10:00:00-07:00#s1"))

        with self.assertRaisesRegex(KeyError, "Submission not found: s1"):
            self.repo.update_submission_admin_fields("s1", "Complete", "Patrick", "Done", "admin")

    def test_delete_submission_removes_submission_record(self):
        self.repo.create_submission({
            "pk": "SUBMISSION",
            "sk": "2026-06-05T10:00:00-07:00#s1",
            "recordType": "submission",
            "submissionId": "s1",
            "submissionTitle": "Volunteer",
            "name": "Pat",
            "email": "pat@example.com",
            "phone": "555",
            "status": "New",
            "assignedTo": "",
            "notes": "",
        })

        deleted = self.repo.delete_submission("s1")

        self.assertEqual(deleted["submissionId"], "s1")
        self.assertEqual(self.repo.list_submissions(limit=10)["items"], [])

    def test_delete_submission_raises_key_error_when_missing(self):
        with self.assertRaisesRegex(KeyError, "Submission not found: missing"):
            self.repo.delete_submission("missing")


if __name__ == "__main__":
    unittest.main()
