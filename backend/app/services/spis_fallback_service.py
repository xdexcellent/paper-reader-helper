"""SPIS (https://spis.hnlat.com/) HTTP-first PDF rescue automation.

第一版使用 httpx + html.parser，不依赖浏览器自动化。
页面结构变化时返回显式 parse_failed，而不是静默失败。
"""

from __future__ import annotations

import io
import json
import logging
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Callable
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from sqlmodel import Session

from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper, PaperStatus, PipelineStatus
from app.services.category_service import initialize_pending_category
from app.services.http_client_factory import get_http_client
from app.services.pipeline import PaperPipelineService
from app.services.spis_settings_service import SpisSettingsService
from app.services.storage import StorageService
from app.services.venue_rank_service import apply_system_rank

logger = logging.getLogger(__name__)

SPIS_BASE_URL = "https://spis.hnlat.com/"
SPIS_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

SOURCE_PDF_AVAILABLE = "available"
SOURCE_PDF_METADATA_ONLY = "metadata_only"
SOURCE_PDF_RESTRICTED = "restricted"

SPIS_AVAILABLE_FOR_RESCUE = "available_for_rescue"
SPIS_QUEUED = "queued"
SPIS_RUNNING = "running"
SPIS_RECOVERED = "recovered"
SPIS_MANUAL_REQUIRED = "manual_required"
SPIS_FAILED = "failed"
SPIS_BLOCKED_GLOBAL = "blocked_global"

RESCUE_ELIGIBLE_SOURCE_STATUSES = {
    SOURCE_PDF_METADATA_ONLY,
    SOURCE_PDF_RESTRICTED,
}
RESCUE_ELIGIBLE_SPIS_STATUSES = {
    "",
    SPIS_AVAILABLE_FOR_RESCUE,
    SPIS_FAILED,
    SPIS_MANUAL_REQUIRED,
    SPIS_BLOCKED_GLOBAL,
}

PENDING_REASON = "Waiting for summary and automatic classification."


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_text(value: str | None) -> str:
    return " ".join((value or "").split())


def _casefold(value: str | None) -> str:
    return _normalize_text(value).casefold()


@dataclass
class SpisFallbackResult:
    status: str
    reason: str
    direct_pdf_url: str = ""
    search_query: str = ""
    search_url: str = ""
    source_url: str = ""
    request_help_url: str = ""
    manual_action_required: bool = False
    global_blocker: bool = False
    context: dict[str, Any] = field(default_factory=dict)

    def to_metadata(self) -> dict[str, Any]:
        payload = asdict(self)
        context = payload.pop("context", {}) or {}
        payload.update(context)
        return payload


class _FormParser(HTMLParser):
    """Minimal HTML form extractor for login / search pages."""

    def __init__(self) -> None:
        super().__init__()
        self.forms: list[dict[str, Any]] = []
        self.links: list[dict[str, str]] = []
        self._current_form: dict[str, Any] | None = None
        self._current_link: dict[str, str] | None = None
        self._capture_link_text = False
        self.title = ""
        self._capture_title = False
        self.body_text_parts: list[str] = []
        self._skip_text = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key.lower(): (value or "") for key, value in attrs}
        lower = tag.lower()
        if lower == "title":
            self._capture_title = True
            return
        if lower in {"script", "style"}:
            self._skip_text = True
            return
        if lower == "form":
            self._current_form = {
                "action": attr_map.get("action", ""),
                "method": (attr_map.get("method") or "get").lower(),
                "id": attr_map.get("id", ""),
                "name": attr_map.get("name", ""),
                "inputs": [],
            }
            self.forms.append(self._current_form)
            return
        if lower in {"input", "button"} and self._current_form is not None:
            self._current_form["inputs"].append(
                {
                    "type": (attr_map.get("type") or "text").lower(),
                    "name": attr_map.get("name", ""),
                    "value": attr_map.get("value", ""),
                    "id": attr_map.get("id", ""),
                    "placeholder": attr_map.get("placeholder", ""),
                }
            )
            return
        if lower == "a":
            href = attr_map.get("href", "")
            self._current_link = {
                "href": href,
                "text": "",
                "title": attr_map.get("title", ""),
                "class": attr_map.get("class", ""),
            }
            self.links.append(self._current_link)
            self._capture_link_text = True

    def handle_endtag(self, tag: str) -> None:
        lower = tag.lower()
        if lower == "title":
            self._capture_title = False
        elif lower in {"script", "style"}:
            self._skip_text = False
        elif lower == "form":
            self._current_form = None
        elif lower == "a":
            self._capture_link_text = False
            self._current_link = None

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if not text:
            return
        if self._capture_title:
            self.title += text
        if self._capture_link_text and self._current_link is not None:
            current = self._current_link.get("text", "")
            self._current_link["text"] = f"{current} {text}".strip()
        if not self._skip_text:
            self.body_text_parts.append(text)

    @property
    def body_text(self) -> str:
        return " ".join(self.body_text_parts)


def parse_spis_html(html: str, *, base_url: str = SPIS_BASE_URL) -> dict[str, Any]:
    """Parse SPIS HTML into structured signals used by the automation service."""
    parser = _FormParser()
    try:
        parser.feed(html or "")
        parser.close()
    except Exception as exc:  # pragma: no cover - html.parser is usually tolerant
        raise ValueError(f"HTML 解析失败: {exc}") from exc

    body_text = parser.body_text
    lower_text = body_text.casefold()
    title = parser.title.strip()

    login_required = any(
        token in lower_text
        for token in (
            "请登录",
            "用户登录",
            "账号登录",
            "login",
            "sign in",
            "用户名",
            "密码",
        )
    ) or any(_looks_like_login_form(form) for form in parser.forms)

    campus_required = any(
        token in lower_text
        for token in (
            "校园网",
            "机构认证",
            "机构访问",
            "ip 认证",
            "ip认证",
            "不在访问范围内",
            "authorized users",
            "shibboleth",
            "vpn",
        )
    )

    request_help = any(
        token in lower_text
        for token in (
            "文献求助",
            "文献传递",
            "原文传递",
            "request full text",
            "document delivery",
        )
    )

    no_results = any(
        token in lower_text
        for token in (
            "未找到",
            "没有找到",
            "无结果",
            "no results",
            "0 条结果",
            "0 results",
            "暂无数据",
        )
    )

    auth_failed = any(
        token in lower_text
        for token in (
            "用户名或密码错误",
            "账号或密码错误",
            "密码错误",
            "登录失败",
            "invalid username",
            "incorrect password",
            "authentication failed",
        )
    )

    direct_pdf_links: list[str] = []
    source_links: list[str] = []
    request_help_links: list[str] = []
    result_links: list[dict[str, str]] = []

    for link in parser.links:
        href = (link.get("href") or "").strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        absolute = urljoin(base_url, href)
        label = f"{link.get('text', '')} {link.get('title', '')} {link.get('class', '')}".strip()
        label_cf = label.casefold()
        href_cf = absolute.casefold()

        is_pdf = (
            href_cf.endswith(".pdf")
            or "pdf" in href_cf
            or "download" in href_cf
            or "直接下载" in label
            or "下载pdf" in label_cf
            or "download pdf" in label_cf
            or "fulltext" in href_cf
            or "full-text" in href_cf
        )
        is_help = (
            "文献求助" in label
            or "文献传递" in label
            or "request" in label_cf
            or "delivery" in label_cf
            or "求助" in label
        )
        is_source = (
            "来源" in label
            or "publisher" in label_cf
            or "原文" in label
            or "source" in label_cf
            or "doi.org" in href_cf
        )

        entry = {"url": absolute, "label": label}
        result_links.append(entry)
        if is_pdf:
            direct_pdf_links.append(absolute)
        if is_help:
            request_help_links.append(absolute)
        if is_source:
            source_links.append(absolute)

    # De-duplicate while preserving order.
    def _unique(values: list[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            ordered.append(value)
        return ordered

    return {
        "title": title,
        "body_text": body_text,
        "forms": parser.forms,
        "links": result_links,
        "login_required": login_required,
        "campus_network_required": campus_required,
        "request_help_only": request_help and not direct_pdf_links,
        "request_help": request_help,
        "no_results": no_results,
        "auth_failed": auth_failed,
        "direct_pdf_links": _unique(direct_pdf_links),
        "source_links": _unique(source_links),
        "request_help_links": _unique(request_help_links),
    }


def _looks_like_login_form(form: dict[str, Any]) -> bool:
    inputs = form.get("inputs") or []
    names = " ".join(
        f"{item.get('name', '')} {item.get('id', '')} {item.get('placeholder', '')} {item.get('type', '')}"
        for item in inputs
    ).casefold()
    has_password = any((item.get("type") or "").lower() == "password" for item in inputs)
    has_user = any(
        token in names
        for token in ("user", "account", "email", "login", "username", "账号", "用户")
    )
    return has_password and has_user


def _pick_login_form(forms: list[dict[str, Any]]) -> dict[str, Any] | None:
    for form in forms:
        if _looks_like_login_form(form):
            return form
    for form in forms:
        if any((item.get("type") or "").lower() == "password" for item in form.get("inputs") or []):
            return form
    return None


def _pick_search_form(forms: list[dict[str, Any]]) -> dict[str, Any] | None:
    for form in forms:
        names = " ".join(
            f"{item.get('name', '')} {item.get('id', '')} {item.get('placeholder', '')}"
            for item in form.get("inputs") or []
        ).casefold()
        if any(token in names for token in ("q", "query", "keyword", "search", "doi", "title", "检索", "关键词")):
            if not _looks_like_login_form(form):
                return form
    # fallback: first non-login form
    for form in forms:
        if not _looks_like_login_form(form):
            return form
    return None


def _fill_form_payload(form: dict[str, Any], values: dict[str, str]) -> dict[str, str]:
    payload: dict[str, str] = {}
    for item in form.get("inputs") or []:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        input_type = (item.get("type") or "text").lower()
        if input_type in {"submit", "button", "image", "reset", "file"}:
            # Keep named submit only when value already present.
            if item.get("value"):
                payload.setdefault(name, item.get("value") or "")
            continue
        if input_type in {"checkbox", "radio"}:
            if name in values:
                payload[name] = values[name]
            elif item.get("value"):
                payload.setdefault(name, item.get("value") or "")
            continue
        if name in values:
            payload[name] = values[name]
        else:
            payload[name] = item.get("value") or ""

    # Map semantic values onto common field names when exact keys missing.
    semantic_map = {
        "username": ("username", "user", "account", "email", "login", "loginname", "userid"),
        "password": ("password", "passwd", "pass", "pwd"),
        "query": ("q", "query", "keyword", "keywords", "search", "wd", "term", "text"),
        "doi": ("doi",),
        "title": ("title", "ti", "paper_title"),
    }
    for semantic, aliases in semantic_map.items():
        if semantic not in values:
            continue
        if any(alias in payload for alias in aliases):
            # already filled via exact name
            for alias in aliases:
                if alias in payload and not payload[alias]:
                    payload[alias] = values[semantic]
            continue
        # try case-insensitive match on existing empty fields
        for key in list(payload.keys()):
            key_cf = key.casefold()
            if any(alias in key_cf for alias in aliases) and not payload[key]:
                payload[key] = values[semantic]
                break
        else:
            # invent first alias only if form has zero query-like fields
            if semantic in {"query", "doi", "title"}:
                payload[aliases[0]] = values[semantic]
            elif semantic in {"username", "password"}:
                payload[aliases[0]] = values[semantic]
    return payload


def classify_spis_page(parsed: dict[str, Any]) -> SpisFallbackResult | None:
    """Return a terminal result if the parsed page already indicates a blocker."""
    if parsed.get("auth_failed"):
        return SpisFallbackResult(
            status=SPIS_BLOCKED_GLOBAL,
            reason="SPIS 账号或密码错误，登录失败",
            global_blocker=True,
            context={"stage": "login"},
        )
    if parsed.get("campus_network_required") and not parsed.get("direct_pdf_links"):
        return SpisFallbackResult(
            status=SPIS_BLOCKED_GLOBAL,
            reason="当前缺少校园网 / 机构访问条件，无法继续 SPIS 下载",
            global_blocker=True,
            context={"stage": "access_check"},
        )
    if parsed.get("direct_pdf_links"):
        return SpisFallbackResult(
            status="direct_pdf_found",
            reason="已找到 SPIS 直接下载入口",
            direct_pdf_url=parsed["direct_pdf_links"][0],
            source_url=(parsed.get("source_links") or [""])[0],
            request_help_url=(parsed.get("request_help_links") or [""])[0],
            context={"stage": "parse", "direct_pdf_links": parsed.get("direct_pdf_links") or []},
        )
    if parsed.get("request_help_only") or (
        parsed.get("request_help") and not parsed.get("direct_pdf_links") and not parsed.get("no_results")
    ):
        return SpisFallbackResult(
            status=SPIS_MANUAL_REQUIRED,
            reason="SPIS 仅提供文献求助 / 文献传递，需人工确认后提交",
            source_url=(parsed.get("source_links") or [""])[0],
            request_help_url=(parsed.get("request_help_links") or [""])[0],
            manual_action_required=True,
            context={"stage": "parse", "request_help_links": parsed.get("request_help_links") or []},
        )
    if parsed.get("no_results"):
        return SpisFallbackResult(
            status=SPIS_FAILED,
            reason="SPIS 未找到匹配结果",
            context={"stage": "search"},
        )
    if parsed.get("source_links") and not parsed.get("direct_pdf_links"):
        return SpisFallbackResult(
            status=SPIS_FAILED,
            reason="SPIS 仅有来源链接，无直接下载入口",
            source_url=parsed["source_links"][0],
            context={"stage": "parse", "source_links": parsed.get("source_links") or []},
        )
    return None


class SpisFallbackService:
    """Unified SPIS rescue service for daily ingestion and manual rescue."""

    def __init__(
        self,
        *,
        client_factory: Callable[..., httpx.Client] | None = None,
        storage_service: StorageService | None = None,
        pipeline_factory: Callable[[], PaperPipelineService] | None = None,
        base_url: str = SPIS_BASE_URL,
    ) -> None:
        self.client_factory = client_factory or get_http_client
        self.storage_service = storage_service or StorageService()
        self.pipeline_factory = pipeline_factory or PaperPipelineService
        self.base_url = base_url.rstrip("/") + "/"
        self._login_checked = False
        self._logged_in = False
        self._global_blocker: SpisFallbackResult | None = None

    # ── Public API ────────────────────────────────────────────────────

    def reset_run_state(self) -> None:
        self._login_checked = False
        self._logged_in = False
        self._global_blocker = None

    @property
    def global_blocker(self) -> SpisFallbackResult | None:
        return self._global_blocker

    def check_global_prerequisites(
        self,
        session: Session,
        *,
        require_enabled: bool = True,
    ) -> SpisFallbackResult | None:
        """Validate SPIS prerequisites.

        When ``require_enabled=True`` (daily auto path), failures that affect the
        whole run are marked ``global_blocker`` and sticky on the service instance.
        When ``require_enabled=False`` (manual rescue), the same conditions return
        a per-paper failure without poisoning run-level fail-fast state.
        """
        settings = SpisSettingsService.get_settings(session)
        if require_enabled and not settings.enabled:
            return SpisFallbackResult(
                status=SPIS_FAILED,
                reason="SPIS fallback 未启用",
                context={"stage": "prerequisites", "enabled": False},
            )
        if not settings.account or not settings.password:
            return self._prereq_failure(
                "SPIS 账号或密码未配置",
                stage="prerequisites",
                sticky=require_enabled,
            )

        if require_enabled and self._global_blocker is not None:
            return self._global_blocker

        try:
            client = self._open_client()
            try:
                response = client.get(self.base_url, headers=self._headers())
                if response.status_code >= 500:
                    return self._prereq_failure(
                        f"SPIS 站点不可达（HTTP {response.status_code}）",
                        stage="connectivity",
                        sticky=require_enabled,
                        status_code=response.status_code,
                    )
                if response.status_code in {401, 403, 451}:
                    return self._prereq_failure(
                        f"SPIS 站点拒绝访问（HTTP {response.status_code}），可能需要校园网 / 机构网络",
                        stage="connectivity",
                        sticky=require_enabled,
                        status_code=response.status_code,
                    )
                response.raise_for_status()
                parsed = parse_spis_html(response.text, base_url=str(response.url))
                if parsed.get("campus_network_required"):
                    return self._prereq_failure(
                        "当前缺少校园网 / 机构访问条件，无法继续 SPIS 下载",
                        stage="access_check",
                        sticky=require_enabled,
                    )
            finally:
                client.close()
        except httpx.HTTPError as exc:
            return self._prereq_failure(
                f"SPIS 站点不可达：{exc}",
                stage="connectivity",
                sticky=require_enabled,
                error=str(exc),
            )
        except Exception as exc:
            return self._prereq_failure(
                f"SPIS 前置检查失败：{exc}",
                stage="prerequisites",
                sticky=require_enabled,
                error=str(exc),
            )
        return None

    def _prereq_failure(
        self,
        reason: str,
        *,
        stage: str,
        sticky: bool,
        **extra: Any,
    ) -> SpisFallbackResult:
        context = {"stage": stage, **extra}
        if not sticky:
            context["manual"] = True
        result = SpisFallbackResult(
            status=SPIS_BLOCKED_GLOBAL if sticky else SPIS_FAILED,
            reason=reason,
            global_blocker=sticky,
            context=context,
        )
        if sticky:
            self._global_blocker = result
        return result

    def attempt_for_candidate(
        self,
        session: Session,
        *,
        title: str,
        authors: str = "",
        year: int | None = None,
        doi: str = "",
        paper: Paper | None = None,
        item: IngestionItem | None = None,
        run_pipeline_on_success: bool = True,
        force: bool = False,
    ) -> SpisFallbackResult:
        """Attempt SPIS rescue for a candidate.

        ``force=True`` is used by manual rescue buttons: it bypasses the
        background-automation enabled switch, but still requires saved credentials
        and real SPIS connectivity.
        """
        if self._global_blocker is not None and not force:
            result = SpisFallbackResult(
                status=SPIS_BLOCKED_GLOBAL,
                reason=self._global_blocker.reason,
                global_blocker=True,
                context={"stage": "short_circuit", "inherited": True},
            )
            self._apply_result(session, result, paper=paper, item=item, run_pipeline=False)
            return result

        settings = SpisSettingsService.get_settings(session)
        if not settings.enabled and not force:
            result = SpisFallbackResult(
                status=SPIS_AVAILABLE_FOR_RESCUE,
                reason="SPIS fallback 未启用，已保留待补救条目",
                context={"stage": "disabled"},
            )
            self._apply_result(session, result, paper=paper, item=item, run_pipeline=False)
            return result

        pre = self.check_global_prerequisites(session, require_enabled=not force)
        # Auto path: only sticky global blockers abort here.
        # Manual/force path: any prerequisite failure aborts this paper only.
        if pre is not None and (pre.global_blocker or force):
            self._apply_result(session, pre, paper=paper, item=item, run_pipeline=False)
            return pre

        if paper is not None:
            paper.spis_status = SPIS_RUNNING
            paper.spis_reason = "正在尝试 SPIS 补救"
            paper.spis_last_attempt_at = _utcnow()
            session.add(paper)
        if item is not None:
            item.spis_status = SPIS_RUNNING
            item.spis_reason = "正在尝试 SPIS 补救"
            item.spis_attempted_at = _utcnow()
            session.add(item)
        session.commit()

        try:
            result = self._run_search_and_download(
                session,
                title=title,
                authors=authors,
                year=year,
                doi=doi,
                account=settings.account,
                password=settings.password,
                sticky_global_blocker=not force,
            )
        except Exception as exc:
            logger.exception("SPIS fallback crashed for title=%s doi=%s", title, doi)
            result = SpisFallbackResult(
                status=SPIS_FAILED,
                reason=f"SPIS 补救过程异常：{exc}",
                context={"stage": "exception", "error": str(exc)},
            )

        if force and result.global_blocker:
            result.global_blocker = False
            if result.status == SPIS_BLOCKED_GLOBAL:
                result.status = SPIS_FAILED
            result.context = {**(result.context or {}), "manual": True, "was_global_blocker": True}
            self._global_blocker = None

        self._apply_result(
            session,
            result,
            paper=paper,
            item=item,
            run_pipeline=run_pipeline_on_success,
        )
        return result

    def attempt_for_paper(
        self,
        session: Session,
        paper: Paper,
        *,
        item: IngestionItem | None = None,
        run_pipeline_on_success: bool = True,
        force: bool = False,
    ) -> SpisFallbackResult:
        doi = (paper.doi or "").strip()
        year = paper.year
        return self.attempt_for_candidate(
            session,
            title=paper.title or "",
            authors=paper.authors or "",
            year=year,
            doi=doi,
            paper=paper,
            item=item,
            run_pipeline_on_success=run_pipeline_on_success,
            force=force,
        )

    # ── Core automation ───────────────────────────────────────────────

    def _run_search_and_download(
        self,
        session: Session,
        *,
        title: str,
        authors: str,
        year: int | None,
        doi: str,
        account: str,
        password: str,
        sticky_global_blocker: bool = True,
    ) -> SpisFallbackResult:
        client = self._open_client()
        try:
            login_result = self._ensure_login(
                client,
                account=account,
                password=password,
                sticky_global_blocker=sticky_global_blocker,
            )
            if login_result is not None:
                return login_result

            queries: list[tuple[str, str]] = []
            if doi:
                queries.append(("doi", doi.strip()))
            normalized_title = _normalize_text(title)
            if normalized_title:
                queries.append(("title", normalized_title))
            if normalized_title and (authors or year):
                extra = normalized_title
                if authors:
                    first_author = authors.split(",")[0].strip()
                    if first_author:
                        extra = f"{extra} {first_author}"
                if year:
                    extra = f"{extra} {year}"
                if extra != normalized_title:
                    queries.append(("title_author_year", extra))

            if not queries:
                return SpisFallbackResult(
                    status=SPIS_FAILED,
                    reason="缺少 DOI 与标题，无法发起 SPIS 检索",
                    context={"stage": "validate"},
                )

            last_result: SpisFallbackResult | None = None
            for query_kind, query in queries:
                search_result = self._search(
                    client,
                    query=query,
                    query_kind=query_kind,
                    sticky_global_blocker=sticky_global_blocker,
                )
                search_result.search_query = query
                if search_result.status == "direct_pdf_found" and search_result.direct_pdf_url:
                    download_result = self._download_pdf(client, search_result.direct_pdf_url)
                    download_result.search_query = query
                    download_result.search_url = search_result.search_url
                    download_result.source_url = search_result.source_url
                    download_result.request_help_url = search_result.request_help_url
                    download_result.context = {
                        **(search_result.context or {}),
                        **(download_result.context or {}),
                        "query_kind": query_kind,
                    }
                    return download_result
                if search_result.global_blocker:
                    if sticky_global_blocker:
                        self._global_blocker = search_result
                    else:
                        search_result.global_blocker = False
                        if search_result.status == SPIS_BLOCKED_GLOBAL:
                            search_result.status = SPIS_FAILED
                    return search_result
                last_result = search_result
                # manual_required / failed: try next query only for no_results
                if search_result.status != SPIS_FAILED or "未找到" not in search_result.reason:
                    return search_result

            return last_result or SpisFallbackResult(
                status=SPIS_FAILED,
                reason="SPIS 未找到匹配结果",
                context={"stage": "search"},
            )
        finally:
            client.close()

    def _mark_global(
        self,
        result: SpisFallbackResult,
        *,
        sticky: bool,
    ) -> SpisFallbackResult:
        if sticky:
            result.global_blocker = True
            if result.status != SPIS_BLOCKED_GLOBAL:
                result.status = SPIS_BLOCKED_GLOBAL
            self._global_blocker = result
            return result
        result.global_blocker = False
        if result.status == SPIS_BLOCKED_GLOBAL:
            result.status = SPIS_FAILED
        result.context = {**(result.context or {}), "manual": True}
        return result

    def _ensure_login(
        self,
        client: httpx.Client,
        *,
        account: str,
        password: str,
        sticky_global_blocker: bool = True,
    ) -> SpisFallbackResult | None:
        if self._logged_in and self._login_checked:
            return None

        try:
            home = client.get(self.base_url, headers=self._headers())
            home.raise_for_status()
        except httpx.HTTPError as exc:
            result = SpisFallbackResult(
                status=SPIS_BLOCKED_GLOBAL,
                reason=f"SPIS 站点不可达：{exc}",
                global_blocker=True,
                context={"stage": "login_home", "error": str(exc)},
            )
            return self._mark_global(result, sticky=sticky_global_blocker)

        try:
            parsed = parse_spis_html(home.text, base_url=str(home.url))
        except ValueError as exc:
            return SpisFallbackResult(
                status=SPIS_FAILED,
                reason=f"SPIS 页面结构变化或解析失败：{exc}",
                context={"stage": "login_parse"},
            )

        # Already authenticated session (no login form / no login cues).
        if not parsed.get("login_required") and _pick_login_form(parsed.get("forms") or []) is None:
            self._login_checked = True
            self._logged_in = True
            return None

        form = _pick_login_form(parsed.get("forms") or [])
        if form is None:
            # Login required but form not recognized.
            if parsed.get("login_required"):
                result = SpisFallbackResult(
                    status=SPIS_BLOCKED_GLOBAL,
                    reason="SPIS 登录流程整体失效：未能识别登录表单",
                    global_blocker=True,
                    context={"stage": "login_form_missing"},
                )
                return self._mark_global(result, sticky=sticky_global_blocker)
            self._login_checked = True
            self._logged_in = True
            return None

        action = urljoin(str(home.url), form.get("action") or "")
        payload = _fill_form_payload(form, {"username": account, "password": password})
        method = (form.get("method") or "post").lower()
        try:
            if method == "get":
                response = client.get(action, params=payload, headers=self._headers())
            else:
                response = client.post(action, data=payload, headers=self._headers())
            response.raise_for_status()
        except httpx.HTTPError as exc:
            result = SpisFallbackResult(
                status=SPIS_BLOCKED_GLOBAL,
                reason=f"SPIS 登录请求失败：{exc}",
                global_blocker=True,
                context={"stage": "login_submit", "error": str(exc)},
            )
            return self._mark_global(result, sticky=sticky_global_blocker)

        try:
            login_parsed = parse_spis_html(response.text, base_url=str(response.url))
        except ValueError as exc:
            result = SpisFallbackResult(
                status=SPIS_BLOCKED_GLOBAL,
                reason=f"SPIS 登录后页面解析失败：{exc}",
                global_blocker=True,
                context={"stage": "login_result_parse"},
            )
            return self._mark_global(result, sticky=sticky_global_blocker)

        if login_parsed.get("auth_failed") or (
            login_parsed.get("login_required") and _pick_login_form(login_parsed.get("forms") or []) is not None
        ):
            result = SpisFallbackResult(
                status=SPIS_BLOCKED_GLOBAL,
                reason="SPIS 账号或密码错误，登录失败",
                global_blocker=True,
                context={"stage": "login_rejected"},
            )
            return self._mark_global(result, sticky=sticky_global_blocker)

        if login_parsed.get("campus_network_required"):
            result = SpisFallbackResult(
                status=SPIS_BLOCKED_GLOBAL,
                reason="当前缺少校园网 / 机构访问条件，无法继续 SPIS 下载",
                global_blocker=True,
                context={"stage": "login_access_check"},
            )
            return self._mark_global(result, sticky=sticky_global_blocker)

        self._login_checked = True
        self._logged_in = True
        return None

    def _search(
        self,
        client: httpx.Client,
        *,
        query: str,
        query_kind: str,
        sticky_global_blocker: bool = True,
    ) -> SpisFallbackResult:
        try:
            home = client.get(self.base_url, headers=self._headers())
            home.raise_for_status()
            home_parsed = parse_spis_html(home.text, base_url=str(home.url))
        except httpx.HTTPError as exc:
            result = SpisFallbackResult(
                status=SPIS_BLOCKED_GLOBAL,
                reason=f"SPIS 站点不可达：{exc}",
                global_blocker=True,
                context={"stage": "search_home", "error": str(exc)},
            )
            return self._mark_global(result, sticky=sticky_global_blocker)
        except ValueError as exc:
            return SpisFallbackResult(
                status=SPIS_FAILED,
                reason=f"SPIS 页面结构变化或解析失败：{exc}",
                context={"stage": "search_home_parse"},
            )

        form = _pick_search_form(home_parsed.get("forms") or [])
        search_url = str(home.url)
        try:
            if form is not None:
                action = urljoin(str(home.url), form.get("action") or "")
                payload = _fill_form_payload(
                    form,
                    {
                        "query": query,
                        "doi": query if query_kind == "doi" else "",
                        "title": query if query_kind != "doi" else "",
                    },
                )
                method = (form.get("method") or "get").lower()
                if method == "get":
                    response = client.get(action, params=payload, headers=self._headers())
                else:
                    response = client.post(action, data=payload, headers=self._headers())
            else:
                # Convention-based fallback endpoints used by many library portals.
                candidates = [
                    urljoin(self.base_url, "search"),
                    urljoin(self.base_url, "search/list"),
                    urljoin(self.base_url, "s"),
                ]
                response = None
                last_exc: Exception | None = None
                for endpoint in candidates:
                    try:
                        response = client.get(
                            endpoint,
                            params={"q": query, "query": query, "doi": query if query_kind == "doi" else ""},
                            headers=self._headers(),
                        )
                        if response.status_code < 500:
                            break
                    except httpx.HTTPError as exc:
                        last_exc = exc
                        response = None
                if response is None:
                    raise last_exc or RuntimeError("SPIS 搜索入口不可用")
            response.raise_for_status()
            search_url = str(response.url)
            parsed = parse_spis_html(response.text, base_url=str(response.url))
        except httpx.HTTPError as exc:
            return SpisFallbackResult(
                status=SPIS_FAILED,
                reason=f"SPIS 检索请求失败：{exc}",
                search_query=query,
                search_url=search_url,
                context={"stage": "search_request", "error": str(exc), "query_kind": query_kind},
            )
        except ValueError as exc:
            return SpisFallbackResult(
                status=SPIS_FAILED,
                reason=f"SPIS 页面结构变化或解析失败：{exc}",
                search_query=query,
                search_url=search_url,
                context={"stage": "search_parse", "query_kind": query_kind},
            )

        classified = classify_spis_page(parsed)
        if classified is not None:
            classified.search_query = query
            classified.search_url = search_url
            classified.context = {
                **(classified.context or {}),
                "query_kind": query_kind,
                "result_links": [link.get("url") for link in (parsed.get("links") or [])[:10]],
            }
            return classified

        # Try first non-navigation result detail page if present.
        detail_links = [
            link.get("url", "")
            for link in (parsed.get("links") or [])
            if link.get("url") and self._looks_like_result_detail(link)
        ]
        for detail_url in detail_links[:3]:
            try:
                detail_resp = client.get(detail_url, headers=self._headers())
                detail_resp.raise_for_status()
                detail_parsed = parse_spis_html(detail_resp.text, base_url=str(detail_resp.url))
            except Exception:
                continue
            detail_classified = classify_spis_page(detail_parsed)
            if detail_classified is None:
                continue
            detail_classified.search_query = query
            detail_classified.search_url = search_url
            detail_classified.source_url = detail_classified.source_url or detail_url
            detail_classified.context = {
                **(detail_classified.context or {}),
                "query_kind": query_kind,
                "detail_url": detail_url,
            }
            return detail_classified

        return SpisFallbackResult(
            status=SPIS_FAILED,
            reason="SPIS 页面结构变化或解析失败：未能识别下载入口或结果",
            search_query=query,
            search_url=search_url,
            context={
                "stage": "search_unrecognized",
                "query_kind": query_kind,
                "result_links": [link.get("url") for link in (parsed.get("links") or [])[:10]],
            },
        )

    def _download_pdf(self, client: httpx.Client, pdf_url: str) -> SpisFallbackResult:
        try:
            response = client.get(pdf_url, headers=self._headers(accept_pdf=True))
            if response.status_code in {401, 403, 451}:
                return SpisFallbackResult(
                    status=SPIS_FAILED,
                    reason=f"SPIS 下载链接存在但下载失败（HTTP {response.status_code}）",
                    direct_pdf_url=pdf_url,
                    context={"stage": "download", "status_code": response.status_code},
                )
            response.raise_for_status()
            content = response.content or b""
            content_type = (response.headers.get("content-type") or "").lower()
            if not self._looks_like_pdf(content, content_type=content_type, url=str(response.url)):
                # Maybe HTML interstitial with another download link.
                try:
                    parsed = parse_spis_html(response.text, base_url=str(response.url))
                except Exception:
                    parsed = {}
                nested = (parsed or {}).get("direct_pdf_links") or []
                if nested and nested[0] != pdf_url:
                    return self._download_pdf(client, nested[0])
                page_result = classify_spis_page(parsed) if parsed else None
                if page_result is not None and page_result.status != "direct_pdf_found":
                    page_result.direct_pdf_url = pdf_url
                    return page_result
                return SpisFallbackResult(
                    status=SPIS_FAILED,
                    reason="SPIS 下载链接存在但返回内容不是有效 PDF",
                    direct_pdf_url=pdf_url,
                    context={"stage": "download_validate", "content_type": content_type},
                )
            # Stash bytes in context for caller to persist.
            return SpisFallbackResult(
                status=SPIS_RECOVERED,
                reason="已通过 SPIS 获取 PDF",
                direct_pdf_url=str(response.url),
                context={"stage": "download", "pdf_bytes": content},
            )
        except httpx.HTTPError as exc:
            return SpisFallbackResult(
                status=SPIS_FAILED,
                reason=f"SPIS 下载链接存在但下载失败：{exc}",
                direct_pdf_url=pdf_url,
                context={"stage": "download", "error": str(exc)},
            )

    # ── Persistence helpers ───────────────────────────────────────────

    def _apply_result(
        self,
        session: Session,
        result: SpisFallbackResult,
        *,
        paper: Paper | None,
        item: IngestionItem | None,
        run_pipeline: bool,
    ) -> None:
        now = _utcnow()
        pdf_bytes = None
        if result.status == SPIS_RECOVERED:
            pdf_bytes = (result.context or {}).pop("pdf_bytes", None)

        if paper is not None:
            paper.spis_last_attempt_at = now
            paper.spis_reason = result.reason
            if result.status == SPIS_RECOVERED and pdf_bytes:
                filename = self._build_pdf_filename(paper, result)
                local_path = self.storage_service.import_uploaded_pdf(filename, io.BytesIO(pdf_bytes))
                paper.local_pdf_path = local_path
                if result.direct_pdf_url:
                    paper.pdf_url = result.direct_pdf_url
                paper.source_pdf_status = SOURCE_PDF_AVAILABLE
                paper.spis_status = SPIS_RECOVERED
                paper.status = PaperStatus.QUEUED
                paper.parse_status = PipelineStatus.PENDING
                paper.summary_status = PipelineStatus.PENDING
                session.add(paper)
                session.commit()
                session.refresh(paper)
                if run_pipeline:
                    try:
                        pipeline = self.pipeline_factory()
                        pipeline.parse_paper(session, paper)
                        pipeline.summarize_paper(session, paper)
                    except Exception as exc:
                        logger.exception("Post-SPIS pipeline failed for paper %s", paper.id)
                        paper.spis_reason = f"{result.reason}；后续解析/摘要失败：{exc}"
                        session.add(paper)
                        session.commit()
            else:
                if result.status == SPIS_RECOVERED and not pdf_bytes:
                    paper.spis_status = SPIS_FAILED
                    paper.spis_reason = "SPIS 报告成功但未获得 PDF 字节"
                else:
                    paper.spis_status = result.status
                if not paper.local_pdf_path:
                    if paper.source_pdf_status not in RESCUE_ELIGIBLE_SOURCE_STATUSES:
                        paper.source_pdf_status = SOURCE_PDF_METADATA_ONLY
                session.add(paper)

        if item is not None:
            item.spis_attempted_at = now
            item.spis_reason = result.reason
            item.spis_status = (
                SPIS_FAILED
                if result.status == SPIS_RECOVERED and paper is not None and paper.spis_status == SPIS_FAILED
                else result.status
            )
            metadata = {}
            try:
                metadata = json.loads(item.metadata_json or "{}")
            except json.JSONDecodeError:
                metadata = {}
            if not isinstance(metadata, dict):
                metadata = {}
            spis_meta = result.to_metadata()
            # never persist raw pdf bytes
            spis_meta.pop("pdf_bytes", None)
            metadata["spis"] = spis_meta
            item.metadata_json = json.dumps(metadata, ensure_ascii=False)
            if paper is not None:
                item.paper_id = paper.id
            if result.status == SPIS_RECOVERED and paper is not None and paper.local_pdf_path:
                item.status = "processed"
                item.error_message = None
                item.pdf_url = result.direct_pdf_url or item.pdf_url
            session.add(item)

        session.commit()
        if paper is not None:
            session.refresh(paper)
        if item is not None:
            session.refresh(item)

    def create_placeholder_paper(
        self,
        session: Session,
        *,
        title: str,
        authors: str = "",
        abstract_raw: str = "",
        source: str,
        source_id: str | None = None,
        pdf_url: str = "",
        canonical_url: str = "",
        published_at: datetime | None = None,
        doi: str = "",
        venue: str = "",
        year: int | None = None,
        source_pdf_status: str = SOURCE_PDF_METADATA_ONLY,
        spis_status: str = SPIS_AVAILABLE_FOR_RESCUE,
        spis_reason: str = "待 SPIS 补救",
    ) -> Paper:
        paper = Paper(
            source=source,
            source_id=source_id or None,
            title=title or "Untitled",
            authors=authors or "",
            abstract_raw=abstract_raw or "",
            pdf_url=pdf_url or "",
            local_pdf_path="",
            published_at=published_at,
            year=year,
            venue=venue or "",
            doi=doi or "",
            url=canonical_url or "",
            status=PaperStatus.QUEUED,
            parse_status=PipelineStatus.PENDING,
            summary_status=PipelineStatus.PENDING,
            embedding_status=PipelineStatus.PENDING,
            source_pdf_status=source_pdf_status,
            spis_status=spis_status,
            spis_reason=spis_reason,
        )
        if venue:
            paper.venue_resolution_status = "resolved"
            paper.venue_resolution_note = "source_metadata"
        apply_system_rank(paper, session)
        initialize_pending_category(session, paper, reason=PENDING_REASON)
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return paper

    # ── low-level helpers ─────────────────────────────────────────────

    def _open_client(self) -> httpx.Client:
        return self.client_factory(timeout=30.0, follow_redirects=True)

    def _headers(self, *, accept_pdf: bool = False) -> dict[str, str]:
        headers = {
            "User-Agent": SPIS_USER_AGENT,
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        if accept_pdf:
            headers["Accept"] = "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8"
        else:
            headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        return headers

    @staticmethod
    def _looks_like_pdf(content: bytes, *, content_type: str, url: str) -> bool:
        if content[:4] == b"%PDF":
            return True
        if "pdf" in content_type and content[:4] == b"%PDF":
            return True
        if url.lower().endswith(".pdf") and content[:4] == b"%PDF":
            return True
        return False

    @staticmethod
    def _looks_like_result_detail(link: dict[str, str]) -> bool:
        href = (link.get("url") or "").casefold()
        label = (link.get("label") or "").casefold()
        if any(token in href for token in ("login", "logout", "css", "js", "favicon")):
            return False
        if any(token in href for token in ("detail", "view", "item", "periodical", "article", "paper")):
            return True
        if any(token in label for token in ("详情", "查看", "detail", "view", "全文")):
            return True
        return False

    @staticmethod
    def _build_pdf_filename(paper: Paper, result: SpisFallbackResult) -> str:
        seed = paper.source_id or paper.doi or paper.title or "spis-paper"
        cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", seed).strip("-") or "spis-paper"
        if result.direct_pdf_url:
            name = urlparse(result.direct_pdf_url).path.rsplit("/", 1)[-1]
            if name.lower().endswith(".pdf"):
                return name
        return f"{cleaned}.pdf"


def is_metadata_only_paper(paper: Paper | None) -> bool:
    if paper is None:
        return False
    if (paper.local_pdf_path or "").strip():
        return False
    status = (paper.source_pdf_status or "").strip()
    return status in RESCUE_ELIGIBLE_SOURCE_STATUSES or status == ""


def is_spis_rescue_eligible(paper: Paper | None) -> bool:
    if paper is None:
        return False
    if (paper.local_pdf_path or "").strip() and (paper.source_pdf_status or "") == SOURCE_PDF_AVAILABLE:
        return False
    if (paper.spis_status or "") == SPIS_RECOVERED and (paper.local_pdf_path or "").strip():
        return False
    source_status = (paper.source_pdf_status or "").strip()
    if source_status and source_status not in RESCUE_ELIGIBLE_SOURCE_STATUSES:
        # still allow empty local path rescue
        if (paper.local_pdf_path or "").strip():
            return False
    spis_status = (paper.spis_status or "").strip()
    if spis_status and spis_status not in RESCUE_ELIGIBLE_SPIS_STATUSES | {SPIS_QUEUED, SPIS_RUNNING}:
        # allow retry on failed/manual/blocked
        if spis_status not in {SPIS_FAILED, SPIS_MANUAL_REQUIRED, SPIS_BLOCKED_GLOBAL, SPIS_AVAILABLE_FOR_RESCUE}:
            if spis_status in {SPIS_QUEUED, SPIS_RUNNING}:
                return False
    return bool((paper.title or "").strip() or (paper.doi or "").strip())
