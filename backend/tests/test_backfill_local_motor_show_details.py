import unittest

from backend.scripts.backfill_local_motor_show_details import backfill_submissions, build_backfill_plan


class BackfillLocalMotorShowDetailsTests(unittest.TestCase):
    def test_backfills_pre_cutoff_motor_show_rows_from_payment_holds_by_email(self):
        submissions = [{
            "submissionId": "sub-1",
            "submissionTitle": "Motor Show Event",
            "submittedAt": "2026-06-11T20:39:00-07:00",
            "name": "driver@example.com",
            "email": "driver@example.com",
            "phone": "555-0000",
            "rawData": {"headers": ["Submissions"], "values": ["motorShowOrder Order"]},
        }]
        holds = [{
            "submissionId": "hold-1",
            "createdAt": "2026-06-11T20:30:00-07:00",
            "payload": {
                "type": "motorShowOrder",
                "formData": {
                    "type": "motorShowOrder",
                    "firstName": "Pat",
                    "lastName": "Halcrow",
                    "email": "driver@example.com",
                    "phone": "555-1212",
                    "year": "1972",
                    "make": "Chevy",
                    "model": "C10",
                    "color": "Silver",
                    "grandTotal": 25,
                },
            },
        }]

        backfilled, updated = backfill_submissions(submissions, holds, "2026-06-15")

        self.assertEqual(updated, 1)
        self.assertEqual(backfilled[0]["name"], "Pat Halcrow")
        self.assertEqual(backfilled[0]["phone"], "555-1212")
        self.assertEqual(backfilled[0]["amount"], 25)
        self.assertEqual(backfilled[0]["source"], "motorShowOrder")
        self.assertEqual(backfilled[0]["rawData"]["year"], "1972")
        self.assertEqual(backfilled[0]["rawData"]["payment_hold_id"], "hold-1")

    def test_assigns_distinct_vehicle_holds_when_email_has_multiple_submissions(self):
        submissions = [
            {
                "submissionId": "sub-1",
                "submissionTitle": "Motor Show Event",
                "submittedAt": "2026-05-13T02:00:00-07:00",
                "email": "driver@example.com",
            },
            {
                "submissionId": "sub-2",
                "submissionTitle": "Motor Show Event",
                "submittedAt": "2026-05-13T02:54:00-07:00",
                "email": "driver@example.com",
            },
        ]
        holds = [
            {
                "submissionId": "mustang-hold",
                "createdAt": "2026-06-13T06:54:07-07:00",
                "rawData": {"rowNumber": 168},
                "payload": {
                    "type": "motorShowOrder",
                    "formData": {
                        "type": "motorShowOrder",
                        "firstName": "Tom",
                        "lastName": "Di Anda",
                        "email": "driver@example.com",
                        "phone": "555-1212",
                        "year": "1967",
                        "make": "Ford",
                        "model": "Mustang",
                    },
                },
            },
            {
                "submissionId": "rough-corvette-hold",
                "createdAt": "2026-06-13T06:54:08-07:00",
                "rawData": {"rowNumber": 169},
                "payload": {
                    "type": "motorShowOrder",
                    "formData": {
                        "type": "motorShowOrder",
                        "email": "driver@example.com",
                        "year": "1993",
                        "make": "Chev",
                        "model": "Corvette C 4 lLTI",
                    },
                },
            },
            {
                "submissionId": "corvette-hold",
                "createdAt": "2026-06-13T06:54:08-07:00",
                "rawData": {"rowNumber": 170},
                "payload": {
                    "type": "motorShowOrder",
                    "formData": {
                        "type": "motorShowOrder",
                        "firstName": "Tom",
                        "lastName": "Di Anda",
                        "email": "driver@example.com",
                        "phone": "555-1212",
                        "year": "1993",
                        "make": "Chev",
                        "model": "Corvette C4 LT1",
                    },
                },
            },
        ]

        plan = build_backfill_plan(submissions, holds, "2026-06-15")

        self.assertEqual(plan["matched"], 2)
        self.assertEqual(plan["updates"][0]["updated"]["rawData"]["model"], "Mustang")
        self.assertEqual(plan["updates"][1]["updated"]["rawData"]["model"], "Corvette C4 LT1")

    def test_does_not_backfill_on_or_after_cutoff(self):
        submissions = [{
            "submissionId": "sub-1",
            "submissionTitle": "Motor Show Event",
            "submittedAt": "2026-06-15T06:36:45-07:00",
            "email": "driver@example.com",
        }]
        holds = [{
            "submissionId": "hold-1",
            "payload": {"type": "motorShowOrder", "formData": {"email": "driver@example.com"}},
        }]

        backfilled, updated = backfill_submissions(submissions, holds, "2026-06-15")

        self.assertEqual(updated, 0)
        self.assertIs(backfilled[0], submissions[0])


if __name__ == "__main__":
    unittest.main()
