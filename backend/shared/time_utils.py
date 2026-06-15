from datetime import datetime
from zoneinfo import ZoneInfo


PACIFIC_TZ = ZoneInfo("America/Los_Angeles")


def pacific_now():
    return datetime.now(ZoneInfo("UTC")).astimezone(PACIFIC_TZ).replace(microsecond=0)


def pacific_now_iso():
    return pacific_now().isoformat()


def pacific_sheet_timestamp():
    return pacific_now().strftime("%Y-%m-%d %H:%M")


def pacific_display_date():
    return pacific_now().strftime("%m/%d/%Y")
