from __future__ import annotations

from datetime import datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "Asia/Shanghai"
_FIXED_OFFSETS: dict[str, tzinfo] = {
    "Asia/Shanghai": timezone(timedelta(hours=8), name="Asia/Shanghai"),
    "UTC": timezone.utc,
}


def get_timezone(timezone_name: str | None) -> tzinfo:
    candidate = timezone_name or DEFAULT_TIMEZONE
    try:
        return ZoneInfo(candidate)
    except ZoneInfoNotFoundError:
        return _FIXED_OFFSETS.get(candidate, timezone.utc)


def get_local_today(timezone_name: str | None) -> datetime:
    return datetime.now(get_timezone(timezone_name))


def is_valid_timezone(timezone_name: str | None) -> bool:
    if not timezone_name:
        return False
    try:
        ZoneInfo(timezone_name)
        return True
    except ZoneInfoNotFoundError:
        return timezone_name in _FIXED_OFFSETS
