import logging
import time
from functools import wraps
from threading import Lock
from urllib.parse import quote

from app.services.http_client_factory import fetch_with_retry, get_http_client

logger = logging.getLogger(__name__)

BASE_URL = "https://www.easyscholar.cc/open/getPublicationRank"
MIN_INTERVAL = 0.5

_last_request_time: float = 0.0
_lock = Lock()


class QuotaExhaustedError(RuntimeError):
    pass


def _rate_limit():
    global _last_request_time
    with _lock:
        elapsed = time.time() - _last_request_time
        if elapsed < MIN_INTERVAL:
            time.sleep(MIN_INTERVAL - elapsed)
        _last_request_time = time.time()


def query_venue_rank(venue: str, api_key: str) -> dict | None:
    if not venue or not api_key:
        return None

    _rate_limit()

    params = {
        "secretKey": api_key,
        "publicationName": venue,
    }

    client = get_http_client(timeout=10, use_db_proxy=True)
    try:
        response = client.get(BASE_URL, params=params)
    finally:
        client.close()

    if response.status_code == 429:
        raise QuotaExhaustedError("EasyScholar API rate limited (429)")

    payload = response.json()
    code = payload.get("code", -1)
    if code != 200:
        msg = payload.get("msg", "")
        if any(kw in msg for kw in ("次数", "limit", "quota", "配额", "额度")):
            raise QuotaExhaustedError(f"EasyScholar quota exhausted: {msg}")
        logger.warning("EasyScholar API error for venue=%s: code=%s msg=%s", venue, code, msg)
        return None

    data = payload.get("data")
    if not data:
        return None

    raw_all = data.get("officialRank", {}).get("all") if isinstance(data, dict) else None
    if raw_all is None:
        return None

    return raw_all


def _merge_cas_top(upgrade: str, top: str) -> str:
    if not upgrade:
        return ""
    if top and "Top" in top:
        return f"{upgrade}Top"
    return upgrade


def parse_response(raw_all: dict) -> dict:
    return {
        "impact_factor": str(raw_all.get("sciif", "") or "").strip(),
        "impact_factor_5y": str(raw_all.get("sciif5", "") or "").strip(),
        "jcr_sci": str(raw_all.get("sci", "") or "").strip(),
        "jcr_ssci": str(raw_all.get("ssci", "") or "").strip(),
        "cas_upgrade": _merge_cas_top(
            str(raw_all.get("sciUp", "") or "").strip(),
            str(raw_all.get("sciUpTop", "") or "").strip(),
        ),
        "cas_upgrade_top": str(raw_all.get("sciUpTop", "") or "").strip(),
        "cas_base": str(raw_all.get("sciBase", "") or "").strip(),
        "cas_upgrade_small": str(raw_all.get("sciUpSmall", "") or "").strip(),
        "jci": str(raw_all.get("jci", "") or "").strip(),
        "esi": str(raw_all.get("esi", "") or "").strip(),
        "warn": str(raw_all.get("sciwarn", "") or "").strip(),
        "ei": str(raw_all.get("eii", "") or "").strip(),
        "ahci": str(raw_all.get("ahci", "") or "").strip(),
        "cssci": str(raw_all.get("cssci", "") or "").strip(),
        "pku": str(raw_all.get("pku", "") or "").strip(),
        "cscd": str(raw_all.get("cscd", "") or "").strip(),
        "utd24": str(raw_all.get("utd24", "") or "").strip(),
        "ft50": str(raw_all.get("ft50", "") or "").strip(),
        "ajg": str(raw_all.get("ajg", "") or "").strip(),
        "fms": str(raw_all.get("fms", "") or "").strip(),
        "swufe": str(raw_all.get("swufe", "") or "").strip(),
        "cufe": str(raw_all.get("cufe", "") or "").strip(),
        "uibe": str(raw_all.get("uibe", "") or "").strip(),
        "sdufe": str(raw_all.get("sdufe", "") or "").strip(),
    }
