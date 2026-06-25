from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from sqlmodel import Session, select

if TYPE_CHECKING:
    from app.models.paper import Paper

logger = logging.getLogger(__name__)

_BUILTIN_DIR = Path(__file__).resolve().parent.parent / "data"
_CCF_FILE = _BUILTIN_DIR / "venue_ranks_ccf.json"
_SCI_IF_EXAMPLE_FILE = _BUILTIN_DIR / "venue_ranks_sci_if.example.json"

_LOCAL_DIR = Path(__file__).resolve().parents[3] / "data" / "rank_data"
_SCI_IF_LOCAL_FILE = _LOCAL_DIR / "venue_ranks_sci_if.json"


@dataclass(frozen=True)
class RankMatch:
    ccf: str
    sci_zone: str
    impact_factor: str


_rank_index: Optional[dict[str, RankMatch]] = None


def _venue_key(venue: str) -> str:
    return _normalize_venue(_clean_venue(venue))


def _normalize_venue(venue: str) -> str:
    if not venue:
        return ""
    lowered = venue.lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", lowered)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


_VENUE_SUFFIX_RE = re.compile(
    r"\b(20\d{2}|19\d{2})\b"
    r"|\b(poster|spotlight|oral|conference|workshop|proceedings|main|track|poster session)\b",
    re.IGNORECASE,
)


def _clean_venue(venue: str) -> str:
    if not venue:
        return ""
    v = _VENUE_SUFFIX_RE.sub(" ", venue)
    v = re.sub(r"\s*\([^)]*\)\s*$", "", v).strip()
    v = re.sub(r"\s+", " ", v).strip()
    return v


def _load_json_file(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        logger.warning("Rank data file %s is not a list, ignored.", path)
        return []
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load rank data file %s: %s", path, exc)
        return []


def _index_entry(raw: dict) -> RankMatch:
    return RankMatch(
        ccf=str(raw.get("ccf", "") or "").strip(),
        sci_zone=str(raw.get("sci_zone", "") or "").strip(),
        impact_factor=str(raw.get("impact_factor", "") or "").strip(),
    )


def _register(index: dict[str, RankMatch], raw: dict, source: str) -> None:
    entry = _index_entry(raw)
    keys: list[str] = []
    venue = str(raw.get("venue", "") or "").strip()
    if venue:
        keys.append(venue)
    aliases = raw.get("aliases") or []
    if isinstance(aliases, list):
        keys.extend(str(a).strip() for a in aliases if str(a).strip())
    for key in keys:
        norm = _normalize_venue(key)
        if norm:
            index[norm] = entry
    if not keys:
        logger.debug("Skip rank entry without venue in %s: %r", source, raw)


def load_rank_index(force: bool = False) -> dict[str, RankMatch]:
    global _rank_index
    if _rank_index is not None and not force:
        return _rank_index

    index: dict[str, RankMatch] = {}

    for raw in _load_json_file(_CCF_FILE):
        _register(index, raw, str(_CCF_FILE))

    local_entries = _load_json_file(_SCI_IF_LOCAL_FILE)
    if local_entries:
        for raw in local_entries:
            _register(index, raw, str(_SCI_IF_LOCAL_FILE))
    elif not _SCI_IF_LOCAL_FILE.exists():
        logger.info(
            "Local SCI/IF rank file not found at %s. "
            "Copy %s to it to enable SCI/IF matching.",
            _SCI_IF_LOCAL_FILE,
            _SCI_IF_EXAMPLE_FILE,
        )

    _rank_index = index
    logger.info("Venue rank index loaded: %d entries.", len(index))
    return index


def match_rank(venue: str) -> Optional[RankMatch]:
    if not venue:
        return None
    index = load_rank_index()
    norm = _normalize_venue(venue)
    if not norm:
        return None
    match = index.get(norm)
    if match is not None:
        return match
    cleaned = _clean_venue(venue)
    if cleaned and cleaned != venue:
        norm2 = _normalize_venue(cleaned)
        if norm2 and norm2 != norm:
            return index.get(norm2)
    return None


def is_ccf_venue(venue: str) -> bool:
    if not venue:
        return False
    match = match_rank(venue)
    return bool(match and match.ccf)


def get_venue_rank(session: Session, venue: str) -> Optional["VenueRank"]:
    from app.models.venue_rank import VenueRank

    key = _venue_key(venue)
    if not key:
        return None
    return session.get(VenueRank, key)


def ensure_venue_rank(session: Session, venue: str) -> None:
    from app.models.venue_rank import VenueRank
    from app.services.easyscholar_service import QuotaExhaustedError, parse_response, query_venue_rank
    from app.services.easyscholar_settings_service import EasyScholarSettingsService

    if not venue:
        return

    settings = EasyScholarSettingsService.get_settings(session)
    if not settings.enabled or not settings.api_key:
        return

    key = _venue_key(venue)
    if not key:
        return

    existing = session.get(VenueRank, key)
    if existing and existing.query_status in ("success", "no_data"):
        return

    if existing is None:
        row = VenueRank(venue_key=key, venue_raw=venue, query_status="pending")
        session.add(row)
        session.commit()

    clean_venue = _clean_venue(venue) or venue.strip()
    try:
        raw_all = query_venue_rank(clean_venue, settings.api_key)
    except QuotaExhaustedError:
        logger.warning("EasyScholar quota exhausted for venue=%s, marking for retry", venue)
        row = session.get(VenueRank, key) if existing is None else existing
        if row:
            row.query_status = "pending"
            session.add(row)
            session.commit()
        return
    except Exception as exc:
        logger.exception("EasyScholar query failed for venue=%s", venue)
        row = session.get(VenueRank, key) if existing is None else existing
        if row:
            row.query_status = "error"
            row.error_message = str(exc)
            session.add(row)
            session.commit()
        return

    row = session.get(VenueRank, key) or VenueRank(venue_key=key, venue_raw=venue)
    if raw_all is None:
        row.query_status = "no_data"
    else:
        parsed = parse_response(raw_all)
        for field_key, field_value in parsed.items():
            setattr(row, field_key, field_value)
        row.query_status = "success"
    row.last_queried_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()


def batch_refresh_venue_ranks(session: Session, api_key: str) -> dict:
    from app.models.paper import Paper
    from app.models.venue_rank import VenueRank
    from app.services.easyscholar_service import QuotaExhaustedError, parse_response, query_venue_rank
    from app.services.easyscholar_settings_service import EasyScholarSettingsService

    settings = EasyScholarSettingsService.get_settings(session)
    if not settings.enabled or not settings.api_key:
        return {"total": 0, "success": 0, "no_data": 0, "error": 0, "pending": 0, "stopped_reason": "disabled"}

    papers = list(session.exec(select(Paper)).all())
    venues = set()
    for p in papers:
        if not p.venue:
            continue
        if is_ccf_venue(p.venue):
            continue
        key = _venue_key(p.venue)
        if key:
            venues.add((key, p.venue))

    existing = list(session.exec(select(VenueRank)).all())
    existing_map = {r.venue_key: r for r in existing}

    total = len(venues)
    success = 0
    no_data = 0
    error_count = 0
    pending = 0
    stopped_reason = ""

    for key, raw_venue in venues:
        if key in existing_map and existing_map[key].query_status == "success":
            success += 1
            continue

        clean_venue = _clean_venue(raw_venue) or raw_venue.strip()
        try:
            raw_all = query_venue_rank(clean_venue, api_key)
        except QuotaExhaustedError:
            pending = total - (success + no_data + error_count)
            stopped_reason = "quota_exhausted"
            logger.warning("EasyScholar quota exhausted during batch refresh, stopping")
            break
        except Exception as exc:
            logger.exception("EasyScholar query failed for venue=%s", raw_venue)
            row = existing_map.get(key) or VenueRank(venue_key=key, venue_raw=raw_venue)
            row.query_status = "error"
            row.error_message = str(exc)
            session.add(row)
            session.commit()
            error_count += 1
            continue

        row = existing_map.get(key) or VenueRank(venue_key=key, venue_raw=raw_venue)
        if raw_all is None:
            row.query_status = "no_data"
            no_data += 1
        else:
            parsed = parse_response(raw_all)
            for field_key, field_value in parsed.items():
                setattr(row, field_key, field_value)
            row.query_status = "success"
            success += 1
        row.last_queried_at = datetime.now(timezone.utc)
        session.add(row)
        session.commit()

    remaining = total - (success + no_data + error_count)
    return {
        "total": total,
        "success": success,
        "no_data": no_data,
        "error": error_count,
        "pending": remaining if not stopped_reason else pending,
        "stopped_reason": stopped_reason,
    }


def apply_system_rank(paper: "Paper", session: Session | None = None) -> bool:
    match = match_rank(paper.venue)
    ccf = match.ccf if match else ""
    sci = match.sci_zone if match else ""
    ifac = match.impact_factor if match else ""

    changed = (
        paper.ccf_rank != ccf
        or paper.sci_zone != sci
        or paper.impact_factor != ifac
    )
    if changed:
        paper.ccf_rank = ccf
        paper.sci_zone = sci
        paper.impact_factor = ifac

    if session is not None and not is_ccf_venue(paper.venue):
        ensure_venue_rank(session, paper.venue)

    return changed
