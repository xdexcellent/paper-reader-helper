"""arXiv API client for searching and fetching papers."""

import logging
import re
import threading
import time
import xml.etree.ElementTree as ET

import httpx

from app.services.http_client_factory import get_http_client

logger = logging.getLogger(__name__)

ARXIV_API_BASE = "https://export.arxiv.org/api/query"
_ARXIV_FIELD_RE = re.compile(r"\b(?:ti|au|abs|co|jr|cat|rn|all):")
_ARXIV_LOGIC_RE = re.compile(r"\b(?:AND|OR|NOT)\b|[()]")
_ARXIV_LOCK = threading.Lock()
_ARXIV_LAST_CALL = {"t": 0.0}
_ARXIV_MIN_INTERVAL = 4.0


class ArxivRateLimitError(RuntimeError):
    pass


def _rate_limit_arxiv() -> None:
    with _ARXIV_LOCK:
        now = time.time()
        elapsed = now - _ARXIV_LAST_CALL["t"]
        if elapsed < _ARXIV_MIN_INTERVAL:
            wait = _ARXIV_MIN_INTERVAL - elapsed
            logger.debug("arXiv throttle: sleeping %.2fs", wait)
            time.sleep(wait)
        _ARXIV_LAST_CALL["t"] = time.time()


def search_arxiv(query: str, max_results: int = 10, *, raise_on_error: bool = False) -> list[dict]:
    """Search arXiv API and return paper metadata.

    Returns list of dicts with: title, authors, abstract, pdf_url, arxiv_id, published
    """
    search_query = _build_search_query(query)
    if not search_query:
        return []

    params = {
        "search_query": search_query,
        "start": 0,
        "max_results": max_results,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }

    try:
        from app.services.http_client_factory import fetch_with_retry

        _rate_limit_arxiv()
        resp = fetch_with_retry(ARXIV_API_BASE, params=params, timeout=30, max_retries=3, backoff_seconds=8.0)
        return _parse_atom_feed(resp.text)
    except httpx.HTTPStatusError as exc:
        if exc.response is not None and exc.response.status_code == 429:
            logger.warning("arXiv search rate limited for query=%s", query)
        else:
            logger.exception("arXiv API request failed")
        if raise_on_error:
            raise
        return []
    except Exception:
        logger.exception("arXiv API request failed")
        if raise_on_error:
            raise
        return []


def fetch_arxiv_paper(arxiv_id: str, *, raise_on_error: bool = False) -> dict:
    normalized_id = arxiv_id.strip()
    if not normalized_id:
        return {}

    params = {"id_list": normalized_id}
    try:
        from app.services.http_client_factory import fetch_with_retry

        _rate_limit_arxiv()
        resp = fetch_with_retry(ARXIV_API_BASE, params=params, timeout=30, max_retries=3, backoff_seconds=8.0)
        results = _parse_atom_feed(resp.text)
        return results[0] if results else {}
    except httpx.HTTPStatusError as exc:
        if exc.response is not None and exc.response.status_code == 429:
            logger.warning("arXiv detail rate limited for id=%s", normalized_id)
            if raise_on_error:
                raise ArxivRateLimitError(f"arxiv_429:{normalized_id}") from exc
            return {}
        logger.exception("arXiv detail request failed for id=%s", normalized_id)
        if raise_on_error:
            raise
        return {}
    except Exception:
        logger.exception("arXiv detail request failed for id=%s", normalized_id)
        if raise_on_error:
            raise
        return {}


def _build_search_query(query: str) -> str:
    normalized = query.strip()
    if not normalized:
        return ""
    if _ARXIV_FIELD_RE.search(normalized) or _ARXIV_LOGIC_RE.search(normalized):
        return normalized
    return f"all:{normalized}"


def _parse_atom_feed(xml_text: str) -> list[dict]:
    """Parse arXiv Atom XML feed into paper dicts."""
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "arxiv": "http://arxiv.org/schemas/atom",
    }

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        logger.error("Failed to parse arXiv XML response")
        return []

    results = []
    for entry in root.findall("atom:entry", ns):
        title_el = entry.find("atom:title", ns)
        summary_el = entry.find("atom:summary", ns)
        published_el = entry.find("atom:published", ns)
        id_el = entry.find("atom:id", ns)

        title = title_el.text.strip().replace("\n", " ") if title_el is not None and title_el.text else ""
        abstract = summary_el.text.strip().replace("\n", " ") if summary_el is not None and summary_el.text else ""
        published = published_el.text.strip() if published_el is not None and published_el.text else ""
        arxiv_id = ""
        if id_el is not None and id_el.text:
            arxiv_id = id_el.text.strip().split("/abs/")[-1]

        authors = []
        for author_el in entry.findall("atom:author", ns):
            name_el = author_el.find("atom:name", ns)
            if name_el is not None and name_el.text:
                authors.append(name_el.text.strip())

        pdf_url = ""
        for link_el in entry.findall("atom:link", ns):
            if link_el.get("title") == "pdf" or (link_el.get("type", "") == "application/pdf"):
                pdf_url = link_el.get("href", "")
                break
        if not pdf_url and arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"

        results.append({
            "title": title,
            "authors": ", ".join(authors),
            "abstract": abstract,
            "pdf_url": pdf_url,
            "arxiv_id": arxiv_id,
            "published": published,
            "journal_ref": _find_arxiv_text(entry, ns, "journal_ref"),
            "doi": _find_arxiv_text(entry, ns, "doi"),
        })

    return results


def _find_arxiv_text(entry: ET.Element, ns: dict[str, str], tag_name: str) -> str:
    el = entry.find(f"arxiv:{tag_name}", ns)
    if el is None or not el.text:
        return ""
    return el.text.strip()
