import unittest
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from backend.shared import time_utils


class TimeUtilsTests(unittest.TestCase):
    def test_pacific_now_uses_los_angeles_timezone(self):
        fixed_utc = datetime(2026, 6, 15, 20, 30, tzinfo=ZoneInfo("UTC"))

        with patch.object(time_utils, "datetime") as datetime_mock:
            datetime_mock.now.return_value = fixed_utc
            pacific = time_utils.pacific_now()

        self.assertEqual(pacific.isoformat(timespec="seconds"), "2026-06-15T13:30:00-07:00")

    def test_pacific_sheet_timestamp_uses_existing_sheet_format(self):
        fixed_utc = datetime(2026, 6, 15, 20, 30, tzinfo=ZoneInfo("UTC"))

        with patch.object(time_utils, "datetime") as datetime_mock:
            datetime_mock.now.return_value = fixed_utc
            timestamp = time_utils.pacific_sheet_timestamp()

        self.assertEqual(timestamp, "2026-06-15 13:30")


if __name__ == "__main__":
    unittest.main()
