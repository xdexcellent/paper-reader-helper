from __future__ import annotations

import xml.etree.ElementTree as ET
from collections.abc import Callable

from app.models.subscription import Subscription
from app.services.http_client_factory import get_http_client
from app.services.source_adapters.base import (
    SourceAdapter,
    SourceCandidate,
    clean_text,
    parse_datetime,
    strip_html,
)

class RssAdapter(SourceAdapter):
    source_kind = "rss"
    artifact_type = "paper"

    def __init__(
        self,
        *,
        fetch_text: Callable[[str], str] | None = None,
    ) -> None:
        self._fetch_text = fetch_text or _default_fetch_text

    def fetch_candidates(self, subscription: Subscription) -> list[SourceCandidate]:
        feed_url = str(subscription.config.get("feed_url") or subscription.query or "").strip()
        if not feed_url:
            return []

        xml_text = self._fetch_text(feed_url)

        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            raise ValueError(f"RSS feed parse failed for {feed_url}") from None

        items = (
            self._parse_atom_feed(root, subscription.fetch_limit)
            if _local_name(root.tag) == "feed"
            else self._parse_rss_feed(root, subscription.fetch_limit)
        )

        return [
            SourceCandidate(
                artifact_type=self.artifact_type,
                source_kind=self.source_kind,
                external_id=item["external_id"],
                title=item["title"],
                authors=item["authors"],
                abstract_raw=item["abstract_raw"],
                canonical_url=item["canonical_url"],
                pdf_url=item["pdf_url"],
                published_at=item["published_at"],
                metadata={"feed_url": feed_url},
            )
            for item in items
        ]

    def _parse_rss_feed(self, root: ET.Element, limit: int) -> list[dict]:
        channel = next((child for child in root if _local_name(child.tag) == "channel"), root)
        items: list[dict] = []
        for entry in (child for child in channel if _local_name(child.tag) == "item"):
            title = _child_text(entry, "title")
            canonical_url = _child_text(entry, "link")
            authors = _child_text(entry, "author", "creator")
            external_id = _child_text(entry, "guid") or canonical_url or title
            items.append(
                {
                    "external_id": external_id,
                    "title": title,
                    "authors": authors,
                    "abstract_raw": strip_html(_child_text(entry, "description", "summary")),
                    "canonical_url": canonical_url,
                    "pdf_url": _rss_pdf_url(entry),
                    "published_at": parse_datetime(_child_text(entry, "pubDate", "published")),
                }
            )
            if len(items) >= limit:
                break
        return items

    def _parse_atom_feed(self, root: ET.Element, limit: int) -> list[dict]:
        items: list[dict] = []
        for entry in (child for child in root if _local_name(child.tag) == "entry"):
            external_id = _child_text(entry, "id")
            canonical_url = ""
            pdf_url = ""
            for link in (child for child in entry if _local_name(child.tag) == "link"):
                href = clean_text(link.get("href"))
                rel = (link.get("rel") or "").strip()
                link_type = (link.get("type") or "").strip()
                if rel in {"alternate", ""} and not canonical_url:
                    canonical_url = href
                if rel == "enclosure" or link_type == "application/pdf":
                    pdf_url = href
            authors = ", ".join(
                _child_text(author, "name")
                for author in entry
                if _local_name(author.tag) == "author" and _child_text(author, "name")
            )
            items.append(
                {
                    "external_id": external_id or canonical_url or _child_text(entry, "title"),
                    "title": _child_text(entry, "title"),
                    "authors": authors,
                    "abstract_raw": strip_html(_child_text(entry, "summary", "content")),
                    "canonical_url": canonical_url,
                    "pdf_url": pdf_url,
                    "published_at": parse_datetime(_child_text(entry, "published", "updated")),
                }
            )
            if len(items) >= limit:
                break
        return items


def _default_fetch_text(url: str) -> str:
    client = get_http_client(timeout=30, follow_redirects=True)
    try:
        response = client.get(url)
        response.raise_for_status()
        return response.text
    finally:
        client.close()


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child_text(element: ET.Element, *names: str) -> str:
    wanted = set(names)
    for child in element:
        if _local_name(child.tag) in wanted and child.text:
            return clean_text(child.text)
    return ""


def _rss_pdf_url(entry: ET.Element) -> str:
    for child in entry:
        if _local_name(child.tag) != "enclosure":
            continue
        href = clean_text(child.get("url"))
        enclosure_type = (child.get("type") or "").lower()
        if href and "pdf" in enclosure_type:
            return href
    return ""
