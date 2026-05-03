"""arXiv API client for searching and fetching papers."""

import logging
import re
import xml.etree.ElementTree as ET

import httpx

from app.services.http_client_factory import get_http_client

logger = logging.getLogger(__name__)

ARXIV_API_BASE = "https://export.arxiv.org/api/query"
_ARXIV_FIELD_RE = re.compile(r"\b(?:ti|au|abs|co|jr|cat|rn|all):")
_ARXIV_LOGIC_RE = re.compile(r"\b(?:AND|OR|NOT)\b|[()]")


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
        client = get_http_client(timeout=30, follow_redirects=True)
        try:
            resp = client.get(ARXIV_API_BASE, params=params)
            resp.raise_for_status()
            return _parse_atom_feed(resp.text)
        finally:
            client.close()
    except Exception:
        logger.exception("arXiv API request failed")
        if raise_on_error:
            raise
        return []


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
            # id format: http://arxiv.org/abs/2301.12345v1
            arxiv_id = id_el.text.strip().split("/abs/")[-1]

        # Authors
        authors = []
        for author_el in entry.findall("atom:author", ns):
            name_el = author_el.find("atom:name", ns)
            if name_el is not None and name_el.text:
                authors.append(name_el.text.strip())

        # PDF link
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
        })

    return results
