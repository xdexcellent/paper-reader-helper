from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import json
import re

from sqlalchemy import or_
from sqlmodel import Session, select

from app.models.daily_briefing import (
    DailyBriefing,
    DailyBriefingPaperItem,
    DailyBriefingProjectItem,
)
from app.models.daily_run import DailyRun
from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper, PaperStatus, PipelineStatus
from app.models.paper_summary import PaperSummary
from app.services.deepseek_client import DeepSeekClient


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


_SUSPICIOUS_SECTION_LABELS = {
    "abstract",
    "introduction",
    "methods",
    "method",
    "conclusion",
    "results",
    "n/a",
    "none",
    "null",
    "tbd",
}


@dataclass
class _BriefingPaperCandidate:
    item: IngestionItem | None
    paper: Paper | None
    summary: PaperSummary | None
    score: float
    reason: str
    summary_text: str
    status_label: str


def _is_meaningful_summary_text(text: str | None) -> bool:
    """判断 LLM 输出的字段是否为有意义的内容。

    拒绝过短、仅为章节标签、或明显的占位符字符串（如 "Abstract"）。
    """
    if not text:
        return False
    stripped = text.strip()
    if len(stripped) < 10:
        return False
    if stripped.lower() in _SUSPICIOUS_SECTION_LABELS:
        return False
    return True


def _contains_chinese(text: str | None) -> bool:
    return bool(text and re.search(r"[\u4e00-\u9fff]", text))


class DailyBriefingService:
    def __init__(self) -> None:
        self._deepseek = DeepSeekClient()

    def generate_for_run(
        self,
        session: Session,
        run: DailyRun,
        *,
        top_n: int,
        project_sidebar_enabled: bool,
        source_count_override: int | None = None,
    ) -> DailyBriefing:
        items = self._get_items_for_briefing_date(session, run.run_date)

        paper_candidates: list[_BriefingPaperCandidate] = []
        project_items: list[IngestionItem] = []
        seen_paper_ids: set[int] = set()
        seen_paper_keys: set[str] = set()
        seen_project_keys: set[str] = set()
        subscription_ids: set[int] = set()
        summary_cache: dict[int, PaperSummary | None] = {}

        def get_summary(paper: Paper | None) -> PaperSummary | None:
            if paper is None:
                return None
            cached = summary_cache.get(paper.id)
            if cached is not None or paper.id in summary_cache:
                return cached
            cached = session.exec(
                select(PaperSummary).where(PaperSummary.paper_id == paper.id)
            ).first()
            summary_cache[paper.id] = cached
            return cached

        for item in items:
            if item.subscription_id is not None:
                subscription_ids.add(item.subscription_id)
            if item.artifact_type == "project":
                if project_sidebar_enabled and item.status == "processed":
                    project_key = self._get_project_key(item)
                    if project_key in seen_project_keys:
                        continue
                    seen_project_keys.add(project_key)
                    project_items.append(item)
                continue

            if item.artifact_type != "paper":
                continue

            paper = session.get(Paper, item.paper_id) if item.paper_id is not None else None
            candidate_key = self._get_paper_candidate_key(item, paper)
            if candidate_key in seen_paper_keys:
                continue
            seen_paper_keys.add(candidate_key)
            if paper is not None:
                seen_paper_ids.add(paper.id)
            summary = get_summary(paper)
            paper_candidates.append(self._build_paper_candidate(item, paper, summary))

        for paper in self._get_standalone_papers_for_date(session, run.run_date, seen_paper_ids):
            seen_paper_ids.add(paper.id)
            summary = get_summary(paper)
            paper_candidates.append(self._build_paper_candidate(None, paper, summary))

        paper_candidates.sort(
            key=lambda candidate: (
                candidate.score,
                candidate.paper.id if candidate.paper is not None else -1,
                candidate.item.id if candidate.item is not None else -1,
            ),
            reverse=True,
        )

        source_count = self._resolve_subscription_count(run, subscription_ids, source_count_override)

        briefing = DailyBriefing(
            daily_run_id=run.id,
            briefing_date=run.run_date,
            status="completed",
            generated_at=_utcnow(),
            top_n=top_n,
            summary_markdown=self._build_summary_markdown(
                run.run_date,
                paper_candidates,
                project_items,
                source_count,
            ),
            paper_count=len(paper_candidates),
            project_count=len(project_items),
            source_count=source_count,
            fallback_used=False,
            metadata_json=json.dumps(
                {
                    "paper_candidates": len(paper_candidates),
                    "project_candidates": len(project_items),
                    "subscriptions_total": source_count,
                    "ready_papers": sum(1 for candidate in paper_candidates if candidate.paper and candidate.paper.status == PaperStatus.READY),
                    "failed_papers": sum(1 for candidate in paper_candidates if candidate.item and candidate.item.status == "failed"),
                },
                ensure_ascii=False,
            ),
        )
        session.add(briefing)
        session.flush()

        for rank, candidate in enumerate(paper_candidates, start=1):
            item = candidate.item
            paper = candidate.paper
            session.add(
                DailyBriefingPaperItem(
                    briefing_id=briefing.id,
                    paper_id=paper.id if paper is not None else None,
                    ingestion_item_id=item.id if item is not None else None,
                    rank=rank,
                    score=candidate.score,
                    reason=candidate.reason,
                    source_kind=(item.source_kind if item is not None else "") or (paper.source if paper is not None else ""),
                    title=(paper.title if paper is not None else "") or (item.title if item is not None else ""),
                    authors=(paper.authors if paper is not None else "") or (item.authors if item is not None else ""),
                    summary_text=candidate.summary_text,
                    canonical_url=(item.canonical_url if item is not None else "") or (paper.pdf_url if paper is not None else ""),
                    pdf_url=(item.pdf_url if item is not None else "") or (paper.pdf_url if paper is not None else ""),
                    published_at=(paper.published_at if paper is not None else None) or (item.published_at if item is not None else None),
                    metadata_json=json.dumps(
                        {
                            "status_label": candidate.status_label,
                            "item_status": item.status if item is not None else "standalone",
                            "paper_status": paper.status if paper is not None else "",
                        },
                        ensure_ascii=False,
                    ),
                )
            )

        for rank, item in enumerate(project_items, start=1):
            # Translate GitHub descriptions to Chinese if needed
            raw_desc = item.abstract_raw or ""
            translated_desc = self._translate_project_summary(raw_desc) or self._fallback_project_summary(item, raw_desc)
            session.add(
                DailyBriefingProjectItem(
                    briefing_id=briefing.id,
                    ingestion_item_id=item.id,
                    rank=rank,
                    title=item.title,
                    url=item.canonical_url,
                    summary=translated_desc,
                    source_kind=item.source_kind,
                    project_key=item.external_id or item.canonical_url or item.title,
                    metadata_json=item.metadata_json,
                )
            )

        session.commit()
        session.refresh(briefing)
        return briefing

    def _translate_project_summary(self, text: str | None) -> str:
        """Translate project description to Chinese. Returns empty string when translation is unavailable."""
        if not text:
            return ""
        if _contains_chinese(text):
            return text
        translated = self._deepseek.translate_to_chinese(text)
        if _contains_chinese(translated):
            return translated
        return ""

    def _get_items_for_briefing_date(self, session: Session, briefing_date: date) -> list[IngestionItem]:
        return list(
            session.exec(
                select(IngestionItem)
                .join(DailyRun, IngestionItem.daily_run_id == DailyRun.id)
                .where(DailyRun.run_date == briefing_date)
                .order_by(IngestionItem.id.asc())
            ).all()
        )

    def _get_standalone_papers_for_date(
        self, session: Session, briefing_date: date, exclude_ids: set[int]
    ) -> list[Paper]:
        day_start = datetime.combine(briefing_date, datetime.min.time(), tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        papers = list(
            session.exec(
                select(Paper).where(
                    Paper.status == "ready",
                    Paper.summary_status == "completed",
                    or_(
                        (Paper.ready_at >= day_start) & (Paper.ready_at < day_end),
                        (Paper.created_at >= day_start) & (Paper.created_at < day_end),
                    ),
                )
            ).all()
        )
        return [p for p in papers if p.id not in exclude_ids]

    def _get_project_key(self, item: IngestionItem) -> str:
        return item.external_id or item.canonical_url or item.title or f"project:{item.id}"

    def _score_paper(self, paper: Paper, summary: PaperSummary | None) -> float:
        score = 100.0
        score += max(0.0, float(paper.category_confidence or 0.0) * 20.0)
        if summary is not None:
            if summary.one_line_summary:
                score += 10.0
            if summary.relevance_note:
                score += 15.0
            if summary.core_contributions:
                score += 10.0
            if summary.method_summary:
                score += 5.0
        if paper.source == "arxiv":
            score += 3.0
        return score

    def _reason_for_paper(self, paper: Paper, summary: PaperSummary | None) -> str:
        if summary is not None and _is_meaningful_summary_text(summary.relevance_note):
            return summary.relevance_note
        if summary is not None and _is_meaningful_summary_text(summary.one_line_summary):
            return summary.one_line_summary
        if paper.category_status == "manual_locked":
            return "已完成处理，并已人工确认分类"
        if paper.category_confidence >= 0.8:
            return "已完成摘要与自动分类，建议优先阅读"
        return "已完成摘要处理，适合进入今日阅读清单"

    def _resolve_subscription_count(
        self,
        run: DailyRun,
        subscription_ids: set[int],
        override: int | None = None,
    ) -> int:
        count = len(subscription_ids)
        try:
            stats = json.loads(run.stats_json or "{}")
        except json.JSONDecodeError:
            stats = {}
        return max(count, int(stats.get("subscriptions_total") or 0), override or 0)

    def _get_paper_candidate_key(self, item: IngestionItem | None, paper: Paper | None) -> str:
        if paper is not None:
            return f"paper:{paper.id}"
        if item is None:
            return "paper:standalone"
        if item.fingerprint:
            return f"fingerprint:{item.fingerprint}"
        if item.external_id:
            return f"external:{item.source_kind}:{item.external_id}"
        if item.canonical_url:
            return f"url:{item.canonical_url}"
        if item.pdf_url:
            return f"pdf:{item.pdf_url}"
        title = " ".join((item.title or "").split()).casefold()
        published = item.published_at.isoformat() if item.published_at else ""
        return f"title:{title}:{published}:{item.id}"

    def _build_paper_candidate(
        self,
        item: IngestionItem | None,
        paper: Paper | None,
        summary: PaperSummary | None,
    ) -> _BriefingPaperCandidate:
        reason = self._reason_for_candidate(item, paper, summary)
        return _BriefingPaperCandidate(
            item=item,
            paper=paper,
            summary=summary,
            score=self._score_candidate(item, paper, summary),
            reason=reason,
            summary_text=self._summary_for_candidate(item, paper, summary, reason),
            status_label=self._status_label_for_candidate(item, paper),
        )

    def _score_candidate(
        self,
        item: IngestionItem | None,
        paper: Paper | None,
        summary: PaperSummary | None,
    ) -> float:
        if paper is not None and paper.status == PaperStatus.READY and paper.summary_status == PipelineStatus.COMPLETED:
            score = self._score_paper(paper, summary)
        elif paper is not None and paper.status == PaperStatus.SUMMARIZE_FAILED:
            score = 72.0
        elif paper is not None and paper.status == PaperStatus.PARSE_FAILED:
            score = 58.0
        elif paper is not None and paper.parse_status == PipelineStatus.COMPLETED:
            score = 68.0
        elif paper is not None:
            score = 52.0
        elif item is not None and item.status == "deduplicated":
            score = 48.0
        elif item is not None and item.status == "failed":
            score = 36.0
        else:
            score = 40.0

        if item is not None:
            if item.status == "processed":
                score += 5.0
            elif item.status == "deduplicated":
                score += 3.0
        return score

    def _status_label_for_candidate(self, item: IngestionItem | None, paper: Paper | None) -> str:
        if paper is not None and paper.status == PaperStatus.READY and paper.summary_status == PipelineStatus.COMPLETED:
            return "已完成摘要"
        if paper is not None and paper.status == PaperStatus.SUMMARIZE_FAILED:
            return "摘要失败"
        if paper is not None and paper.status == PaperStatus.PARSE_FAILED:
            return "解析失败"
        if paper is not None and paper.parse_status == PipelineStatus.COMPLETED:
            return "已完成解析"
        if item is not None and item.status == "deduplicated":
            return "复用已有论文"
        if item is not None and item.status == "failed":
            return "处理失败"
        if item is not None and item.status == "pending":
            return "等待处理"
        return "候选条目"

    def _reason_for_candidate(
        self,
        item: IngestionItem | None,
        paper: Paper | None,
        summary: PaperSummary | None,
    ) -> str:
        if paper is not None and paper.status == PaperStatus.READY and paper.summary_status == PipelineStatus.COMPLETED:
            return self._reason_for_paper(paper, summary)
        if item is not None and item.status == "deduplicated":
            return "该论文在今天的多个订阅结果中重复出现，已沿用已有解析结果统一展示。"
        if paper is not None and paper.status == PaperStatus.PARSE_FAILED:
            return "PDF 已抓取，但解析服务返回失败，可在论文库中重试解析。"
        if paper is not None and paper.status == PaperStatus.SUMMARIZE_FAILED:
            return "论文已完成解析，但中文摘要生成失败，可稍后重试摘要。"
        if paper is not None and paper.parse_status == PipelineStatus.COMPLETED:
            return "论文已完成解析，正在等待摘要生成。"
        if item is not None and item.status == "failed":
            return self._friendly_failure_reason(item.error_message)
        return "该论文已纳入今日订阅结果，供你统一查看。"

    def _summary_for_candidate(
        self,
        item: IngestionItem | None,
        paper: Paper | None,
        summary: PaperSummary | None,
        fallback: str,
    ) -> str:
        if summary is not None and _is_meaningful_summary_text(summary.one_line_summary):
            return summary.one_line_summary
        if summary is not None and _is_meaningful_summary_text(summary.relevance_note):
            return summary.relevance_note
        if item is not None and item.abstract_raw:
            if _contains_chinese(item.abstract_raw):
                return item.abstract_raw.strip()
            return "已抓取到原始英文摘要，但暂未生成中文摘要，可点击原文链接查看详情。"
        return fallback

    def _friendly_failure_reason(self, error_message: str | None) -> str:
        if not error_message:
            return "抓取或处理过程中出现错误，当前仅保留候选信息。"
        lower = error_message.lower()
        if "no pdf_url" in lower or "no pdf url" in lower:
            return "源站未提供可下载 PDF，暂时无法进入解析流程。"
        if "mineru" in lower or "failed to read file" in lower:
            return "PDF 已抓取，但解析服务返回失败，可在论文库中重试解析。"
        if "10061" in error_message or "connecterror" in lower:
            return "连接外部服务失败，请确认代理地址可用且本地代理程序已启动。"
        return f"处理过程中出现错误：{error_message}"

    def _project_source_label(self, item: IngestionItem) -> str:
        mapping = {
            "github_trending": "GitHub 趋势项目",
            "hf_papers": "Hugging Face 论文项目",
            "openreview": "OpenReview 项目",
        }
        return mapping.get(item.source_kind, item.source_kind or "外部项目")

    def _fallback_project_summary(self, item: IngestionItem, raw_desc: str | None) -> str:
        try:
            metadata = json.loads(item.metadata_json or "{}")
        except json.JSONDecodeError:
            metadata = {}
        details: list[str] = [f"{self._project_source_label(item)} {item.title}"]
        language = str(metadata.get("language") or "").strip()
        stars = metadata.get("stars")
        if language:
            details.append(f"主要语言为 {language}")
        if stars:
            details.append(f"当前热度约 {stars} 星")
        if raw_desc:
            details.append("原始英文简介暂未自动翻译，可点击链接查看详情")
        else:
            details.append("当前未提供可用简介，可点击链接查看详情")
        return "，".join(details) + "。"

    def _build_summary_markdown(
        self,
        briefing_date: date,
        papers: list[_BriefingPaperCandidate],
        project_items: list[IngestionItem],
        source_count: int,
    ) -> str:
        llm_markdown, llm_error = self._build_llm_report_markdown(
            briefing_date,
            papers,
            project_items,
            source_count,
        )
        if llm_markdown:
            return llm_markdown

        return self._build_rule_based_report_markdown(
            briefing_date,
            papers,
            project_items,
            source_count,
            llm_error=llm_error,
        )

    def _build_llm_report_markdown(
        self,
        briefing_date: date,
        papers: list[_BriefingPaperCandidate],
        project_items: list[IngestionItem],
        source_count: int,
    ) -> tuple[str | None, str | None]:
        if not papers:
            return None, "今日没有可供深度综述的论文候选。"
        if not self._deepseek.api_key:
            return None, "LLM API Key 未配置。"

        paper_lines: list[str] = []
        for rank, candidate in enumerate(papers, start=1):
            item = candidate.item
            paper = candidate.paper
            title = (paper.title if paper is not None else "") or (item.title if item is not None else f"论文 {rank}")
            url = self._paper_link(candidate)
            paper_lines.append(
                "\n".join(
                    [
                        f"论文{rank}: {title}",
                        f"链接: {url or '无'}",
                        f"来源: {(item.source_kind if item is not None else '') or (paper.source if paper is not None else '')}",
                        f"状态: {candidate.status_label}",
                        f"阅读提示: {candidate.reason}",
                        f"内容摘要: {candidate.summary_text}",
                    ]
                )
            )

        project_lines = [
            f"- {item.title}: {item.abstract_raw or '暂无简介'}"
            for item in project_items[:10]
        ]
        messages = [
            {
                "role": "system",
                "content": (
                    "你是中文科研情报分析助手。请把当天订阅到的论文整理成结构化中文日报。"
                    "必须输出 Markdown，且只输出 Markdown。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"日期：{briefing_date.isoformat()}\n"
                    f"订阅源数量：{source_count}\n"
                    f"论文候选数量：{len(papers)}\n"
                    f"相关项目数量：{len(project_items)}\n\n"
                    "请生成以下四个一级结构，标题必须完全一致：\n"
                    "## 今日概览\n"
                    "## 热点方向\n"
                    "## Top 5 深度点评\n"
                    "## 其余论文速览\n\n"
                    "要求：\n"
                    "1. 热点方向中引用论文时必须使用超链接格式，例如 [论文1](论文1的链接)。\n"
                    "2. Top 5 深度点评也必须使用 [论文N](链接) 开头。\n"
                    "3. 不要把所有论文简单平铺，要先总结趋势，再做点评。\n"
                    "4. 如果论文处理失败，也要说明当前状态和可读价值。\n\n"
                    "论文候选：\n"
                    + "\n\n".join(paper_lines)
                    + "\n\n相关项目：\n"
                    + ("\n".join(project_lines) if project_lines else "无")
                ),
            },
        ]
        try:
            markdown = self._deepseek.chat(messages, model="gpt-5.4").strip()
        except Exception as exc:
            return None, str(exc)

        if markdown.startswith("对话失败") or "API Key 未配置" in markdown:
            return None, markdown

        if (
            not markdown
            or "## 今日概览" not in markdown
            or "## 热点方向" not in markdown
            or "## Top 5 深度点评" not in markdown
        ):
            return None, "LLM 返回内容不符合日报结构要求。"

        return f"# {briefing_date.isoformat()} 每日速览\n\n{markdown}", None

    def _build_rule_based_report_markdown(
        self,
        briefing_date: date,
        papers: list[_BriefingPaperCandidate],
        project_items: list[IngestionItem],
        source_count: int,
        *,
        llm_error: str | None = None,
    ) -> str:
        if not papers:
            return (
                f"# {briefing_date.isoformat()} 每日速览\n\n"
                f"> LLM 深度综述生成失败：{llm_error or '今日没有可分析论文'}。以下为规则生成版本。\n\n"
                f"今日共扫描 {source_count} 个订阅源，但暂未形成可展示的论文候选。"
            )

        topics = self._group_papers_by_topic(papers)
        rank_by_candidate = {id(candidate): rank for rank, candidate in enumerate(papers, start=1)}
        lines = [
            f"# {briefing_date.isoformat()} 每日速览",
            "",
            f"> LLM 深度综述生成失败：{llm_error or '模型调用不可用'}。以下为规则生成版本。",
            "",
            "## 今日概览",
            "",
            f"今日共扫描 {source_count} 个订阅源，汇总 {len(papers)} 篇论文候选，相关项目 {len(project_items)} 个。",
            f"从标题、摘要和处理状态看，今天主要集中在 {self._topic_overview_text(topics)}。",
            "未完成处理的论文会保留当前状态，便于后续重试或手动查看原文。",
            "",
            "## 热点方向",
        ]

        for topic_index, (topic, candidates) in enumerate(topics[:5], start=1):
            refs = "、".join(
                self._paper_ref(candidate, rank_by_candidate[id(candidate)])
                for candidate in candidates[:4]
            )
            lines.extend(
                [
                    "",
                    f"{topic_index}. **{topic}**：今日相关论文 {len(candidates)} 篇，代表论文包括 {refs}。"
                    f"{self._topic_reason(topic, candidates)}",
                ]
            )

        lines.extend(["", "## Top 5 深度点评"])
        for rank, candidate in enumerate(papers[:5], start=1):
            item = candidate.item
            paper = candidate.paper
            title = (paper.title if paper is not None else "") or (item.title if item is not None else f"论文 {rank}")
            ref = self._paper_ref(candidate, rank)
            lines.extend(
                [
                    "",
                    f"{rank}. {ref} **{title}**：{self._deep_commentary_for_candidate(candidate)}",
                    "",
                    f"   - 当前状态：{candidate.status_label}",
                    f"   - 阅读提示：{candidate.reason}",
                    f"   - 内容摘要：{candidate.summary_text}",
                ]
            )

        remaining = papers[5:]
        if remaining:
            lines.extend(["", "## 其余论文速览"])
            for offset, candidate in enumerate(remaining, start=6):
                item = candidate.item
                paper = candidate.paper
                title = (paper.title if paper is not None else "") or (item.title if item is not None else f"论文 {offset}")
                lines.extend(
                    [
                        "",
                        f"- {self._paper_ref(candidate, offset)} **{title}**：{candidate.status_label}。{candidate.reason}",
                    ]
                )
        return "\n".join(lines)

    def _paper_link(self, candidate: _BriefingPaperCandidate) -> str:
        item = candidate.item
        paper = candidate.paper
        return (
            (item.canonical_url if item is not None else "")
            or (item.pdf_url if item is not None else "")
            or (paper.pdf_url if paper is not None else "")
            or ""
        )

    def _paper_ref(self, candidate: _BriefingPaperCandidate, rank: int) -> str:
        url = self._paper_link(candidate)
        label = f"论文{rank}"
        return f"[{label}]({url})" if url else label

    def _group_papers_by_topic(
        self,
        papers: list[_BriefingPaperCandidate],
    ) -> list[tuple[str, list[_BriefingPaperCandidate]]]:
        grouped: dict[str, list[_BriefingPaperCandidate]] = {}
        for candidate in papers:
            topic = self._infer_topic(candidate)
            grouped.setdefault(topic, []).append(candidate)
        return sorted(grouped.items(), key=lambda row: len(row[1]), reverse=True)

    def _infer_topic(self, candidate: _BriefingPaperCandidate) -> str:
        item = candidate.item
        paper = candidate.paper
        text = " ".join(
            [
                (paper.title if paper is not None else "") or (item.title if item is not None else ""),
                candidate.reason,
                candidate.summary_text,
            ]
        ).lower()
        topic_rules = [
            ("AI 生成与多模态内容", ["diffusion", "generation", "生成", "speech", "video", "image", "multimodal", "audio"]),
            ("智能体与软件工程", ["agent", "coding", "repository", "代码", "软件", "commit", "github"]),
            ("评测基准与数据集", ["benchmark", "evaluation", "评测", "基准", "dataset"]),
            ("训练方法与对齐优化", ["training", "post-training", "reward", "rl", "alignment", "tuning", "训练", "奖励"]),
            ("系统效率与工程部署", ["efficient", "cache", "inference", "quantization", "系统", "效率", "硬件"]),
            ("理论模型与数学基础", ["quantum", "theorem", "graph", "harmonic", "数学", "量子", "理论"]),
        ]
        for topic, keywords in topic_rules:
            if any(keyword in text for keyword in keywords):
                return topic
        return "综合研究动态"

    def _topic_overview_text(self, topics: list[tuple[str, list[_BriefingPaperCandidate]]]) -> str:
        names = [topic for topic, _items in topics[:3]]
        if not names:
            return "零散方向"
        if len(names) == 1:
            return names[0]
        return "、".join(names[:-1]) + f" 和 {names[-1]}"

    def _topic_reason(self, topic: str, candidates: list[_BriefingPaperCandidate]) -> str:
        first = candidates[0]
        if topic == "AI 生成与多模态内容":
            return " 这一方向反映生成模型正在从单一内容生成转向更细粒度的控制、评测和跨模态表达。"
        if topic == "智能体与软件工程":
            return " 这一方向说明智能体能力正在向代码仓库理解、长期记忆和自动化协作扩展。"
        if topic == "评测基准与数据集":
            return " 这些工作通常决定后续模型能力比较的标准，值得优先关注评测定义是否合理。"
        if topic == "训练方法与对齐优化":
            return " 该方向关注模型后训练、奖励控制和对齐策略，直接影响模型可控性与应用稳定性。"
        if topic == "系统效率与工程部署":
            return " 这些论文更偏向真实部署约束，关注推理成本、硬件友好性和系统可扩展性。"
        if topic == "理论模型与数学基础":
            return " 该方向偏基础研究，但可能为后续算法和系统设计提供新的结构性工具。"
        return f" 该方向的代表论文当前状态为“{first.status_label}”，可作为今日补充阅读线索。"

    def _deep_commentary_for_candidate(self, candidate: _BriefingPaperCandidate) -> str:
        summary = candidate.summary
        if summary is not None:
            pieces = [
                text
                for text in [
                    summary.core_contributions,
                    summary.method_summary,
                    summary.limitations,
                ]
                if _is_meaningful_summary_text(text)
            ]
            if pieces:
                return " ".join(pieces[:3])
        if candidate.paper is None:
            return "该条目尚未进入完整解析流程，当前更适合作为趋势线索和后续补抓对象。"
        if candidate.paper.status == PaperStatus.PARSE_FAILED:
            return "论文 PDF 已进入处理流程但解析失败，建议优先重试解析后再判断其研究价值。"
        if candidate.paper.status == PaperStatus.SUMMARIZE_FAILED:
            return "论文已具备正文内容但摘要生成失败，建议重试摘要以获得更稳定的中文解读。"
        return candidate.reason

    def get_briefing_by_date(
        self,
        session: Session,
        briefing_date: date,
    ) -> DailyBriefing | None:
        return session.exec(
            select(DailyBriefing)
            .where(DailyBriefing.briefing_date == briefing_date)
            .order_by(DailyBriefing.generated_at.desc())
        ).first()

    def get_latest_successful(self, session: Session) -> DailyBriefing | None:
        return session.exec(
            select(DailyBriefing)
            .where(DailyBriefing.status == "completed")
            .order_by(DailyBriefing.generated_at.desc())
        ).first()

    def get_history(self, session: Session, days: int = 7) -> list[DailyBriefing]:
        limit = max(1, min(days, 30))
        rows = session.exec(
            select(DailyBriefing).order_by(
                DailyBriefing.briefing_date.desc(),
                DailyBriefing.generated_at.desc(),
            )
        ).all()
        by_date: list[DailyBriefing] = []
        seen: set[date] = set()
        for briefing in rows:
            if briefing.briefing_date in seen:
                continue
            seen.add(briefing.briefing_date)
            by_date.append(briefing)
            if len(by_date) >= limit:
                break
        return by_date

    def get_paper_items(
        self,
        session: Session,
        briefing_id: int,
    ) -> list[DailyBriefingPaperItem]:
        return list(
            session.exec(
                select(DailyBriefingPaperItem)
                .where(
                    or_(
                        DailyBriefingPaperItem.briefing_id == briefing_id,
                        DailyBriefingPaperItem.daily_briefing_id == briefing_id,
                    )
                )
                .order_by(DailyBriefingPaperItem.rank.asc(), DailyBriefingPaperItem.rank_order.asc())
            ).all()
        )

    def get_project_items(
        self,
        session: Session,
        briefing_id: int,
    ) -> list[DailyBriefingProjectItem]:
        return list(
            session.exec(
                select(DailyBriefingProjectItem)
                .where(
                    or_(
                        DailyBriefingProjectItem.briefing_id == briefing_id,
                        DailyBriefingProjectItem.daily_briefing_id == briefing_id,
                    )
                )
                .order_by(DailyBriefingProjectItem.rank.asc(), DailyBriefingProjectItem.sort_order.asc())
            ).all()
        )

    def get_failed_items_for_run(
        self,
        session: Session,
        daily_run_id: int | None,
    ) -> list[IngestionItem]:
        """Return all failed paper-type ingestion items for a daily run, sorted by id asc."""
        if daily_run_id is None:
            return []
        return list(
            session.exec(
                select(IngestionItem)
                .where(IngestionItem.daily_run_id == daily_run_id)
                .where(IngestionItem.status == "failed")
                .where(IngestionItem.artifact_type == "paper")
                .order_by(IngestionItem.id.asc())
            ).all()
        )

    def friendly_failure_reason(self, error_message: str | None) -> str:
        """Public wrapper for _friendly_failure_reason so route handlers can format reasons."""
        return self._friendly_failure_reason(error_message)
