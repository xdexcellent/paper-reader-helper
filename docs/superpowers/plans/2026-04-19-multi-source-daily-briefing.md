# 多源自动抓取与每日速览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有论文阅读器实现多源自动抓取、自动处理、日报快照生成，并在“工作看板”中展示当日 Top 5 论文与相关项目侧栏。

**Architecture:** 后端继续保持单体 FastAPI 架构，在现有 `PaperPipelineService` 之上新增自动化配置、抓取记录、日报快照和统一 `SourceAdapter` 层。日报不做实时拼装，而是由每日编排器在配置时间生成快照，前端工作看板读取当日或最近一期成功日报。

**Tech Stack:** Python 3.12、FastAPI、SQLModel、httpx、pytest、React 18、TypeScript、Vite、Vitest、React Testing Library、SQLite。

---

## 范围说明

本计划覆盖以下 spec：

- `docs/superpowers/specs/2026-04-19-multi-source-daily-briefing-design.md`

本计划明确包含：

- 后端多源订阅模型扩展
- 全局自动化设置
- `DailyRun / IngestionItem / DailyBriefing*` 数据模型
- `arXiv / RSS / OpenReview / Hugging Face Papers / GitHub Trending` 适配层
- 每日编排服务
- 日报快照 API
- 工作看板改造
- 自动化设置 UI

本计划明确不包含：

- 邮件 / Webhook / 飞书 / Telegram 外部通知
- 每个订阅单独配置不同运行时间
- 复杂消息队列（Celery / Redis）
- 大规模并行调度优化

> 说明：根据当前协作约束，本计划 **不包含 git 提交/分支步骤**。

---

## 文件结构

### 后端模型

- Create: `backend/app/models/automation_settings.py`
- Create: `backend/app/models/daily_run.py`
- Create: `backend/app/models/ingestion_item.py`
- Create: `backend/app/models/daily_briefing.py`
- Modify: `backend/app/models/subscription.py`
- Modify: `backend/app/models/paper.py`

### 后端 schema

- Create: `backend/app/schemas/automation.py`
- Create: `backend/app/schemas/briefing.py`
- Modify: `backend/app/schemas/paper.py`

### 后端服务

- Create: `backend/app/services/source_adapters/__init__.py`
- Create: `backend/app/services/source_adapters/base.py`
- Create: `backend/app/services/source_adapters/arxiv_adapter.py`
- Create: `backend/app/services/source_adapters/rss_adapter.py`
- Create: `backend/app/services/source_adapters/openreview_adapter.py`
- Create: `backend/app/services/source_adapters/hf_papers_adapter.py`
- Create: `backend/app/services/source_adapters/github_trending_adapter.py`
- Create: `backend/app/services/source_adapters/registry.py`
- Create: `backend/app/services/automation_settings_service.py`
- Create: `backend/app/services/daily_ingestion.py`
- Create: `backend/app/services/daily_briefing_service.py`
- Create: `backend/app/services/automation_scheduler.py`
- Modify: `backend/app/services/arxiv_client.py`
- Modify: `backend/app/services/task_queue.py`
- Modify: `backend/app/services/pipeline.py`

### 后端 API

- Create: `backend/app/api/routes/automation.py`
- Modify: `backend/app/api/routes/briefing.py`
- Modify: `backend/app/api/routes/subscriptions.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/core/db.py`

### 后端测试

- Create: `backend/tests/test_automation_settings.py`
- Create: `backend/tests/test_source_adapters.py`
- Create: `backend/tests/test_daily_ingestion.py`
- Create: `backend/tests/test_daily_briefing_api.py`
- Modify: `backend/tests/test_task_queue_routes.py`
- Modify: `backend/tests/test_categories.py`
- Modify: `backend/tests/conftest.py`

### 前端 API 与类型

- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types.ts`

### 前端组件

- Modify: `frontend/src/components/DailyBriefingShell.tsx`
- Modify: `frontend/src/components/SubscriptionPage.tsx`
- Create: `frontend/src/components/AutomationSettingsPanel.tsx`
- Create: `frontend/src/components/BriefingHistoryPicker.tsx`
- Create: `frontend/src/components/BriefingTopPapers.tsx`
- Create: `frontend/src/components/BriefingProjectsSidebar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`

### 前端测试

- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/lib/api.test.ts`

---

## Task 1: 扩展后端数据模型与数据库迁移

**Files:**
- Create: `backend/app/models/automation_settings.py`
- Create: `backend/app/models/daily_run.py`
- Create: `backend/app/models/ingestion_item.py`
- Create: `backend/app/models/daily_briefing.py`
- Modify: `backend/app/models/subscription.py`
- Modify: `backend/app/models/paper.py`
- Modify: `backend/app/core/db.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_automation_settings.py`

- [ ] **Step 1: 先写失败测试，锁定自动化设置默认值与单例读取行为**

```python
# backend/tests/test_automation_settings.py
from sqlmodel import Session, select

from app.core.db import engine
from app.models.automation_settings import AutomationSettings
from app.services.automation_settings_service import AutomationSettingsService


def test_get_settings_bootstraps_default_row() -> None:
    service = AutomationSettingsService()

    settings = service.get_settings()

    assert settings.enabled is True
    assert settings.schedule_time == "12:00"
    assert settings.timezone == "Asia/Shanghai"
    assert settings.top_n == 5
    assert settings.briefing_enabled is True

    with Session(engine) as session:
        rows = session.exec(select(AutomationSettings)).all()
    assert len(rows) == 1
```

- [ ] **Step 2: 运行测试，确认当前模型和服务尚未存在**

Run: `cd backend && python -m pytest tests/test_automation_settings.py -q`

Expected: FAIL，报 `ModuleNotFoundError` 或 `ImportError`，指出 `automation_settings` 模型 / service 尚未实现。

- [ ] **Step 3: 写最小模型与服务实现，先把全局设置落库**

```python
# backend/app/models/automation_settings.py
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class AutomationSettings(SQLModel, table=True):
    id: Optional[int] = Field(default=1, primary_key=True)
    enabled: bool = True
    schedule_time: str = "12:00"
    timezone: str = "Asia/Shanghai"
    top_n: int = 5
    briefing_enabled: bool = True
    project_sidebar_enabled: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

```python
# backend/app/services/automation_settings_service.py
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.models.automation_settings import AutomationSettings


class AutomationSettingsService:
    def get_settings(self) -> AutomationSettings:
        with Session(engine) as session:
            row = session.exec(select(AutomationSettings)).first()
            if row is None:
                row = AutomationSettings()
                session.add(row)
                session.commit()
                session.refresh(row)
            return row

    def update_settings(self, **changes) -> AutomationSettings:
        with Session(engine) as session:
            row = session.exec(select(AutomationSettings)).first()
            if row is None:
                row = AutomationSettings()
            for key, value in changes.items():
                setattr(row, key, value)
            row.updated_at = datetime.now(timezone.utc)
            session.add(row)
            session.commit()
            session.refresh(row)
            return row
```

```python
# backend/app/models/daily_run.py
from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class DailyRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_date: date
    scheduled_for: datetime
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    status: str = "running"
    trigger_type: str = "scheduled"
    stats_json: str = "{}"
    error_message: str = ""
```

```python
# backend/app/models/ingestion_item.py
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class IngestionItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    daily_run_id: int = Field(index=True, foreign_key="dailyrun.id")
    subscription_id: int = Field(index=True, foreign_key="subscription.id")
    source_kind: str = Field(index=True)
    artifact_type: str = Field(index=True)
    external_id: str = ""
    canonical_url: str = ""
    pdf_url: str = ""
    title: str
    authors: str = ""
    abstract_raw: str = ""
    published_at: Optional[datetime] = None
    discovered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    fingerprint: str = Field(index=True)
    status: str = "discovered"
    paper_id: Optional[int] = Field(default=None, foreign_key="paper.id")
    error_message: str = ""
    metadata_json: str = "{}"
```

```python
# backend/app/models/daily_briefing.py
from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class DailyBriefing(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    daily_run_id: int = Field(index=True, foreign_key="dailyrun.id")
    briefing_date: date = Field(index=True)
    status: str = "completed"
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    top_n: int = 5
    summary_markdown: str = ""
    paper_count: int = 0
    project_count: int = 0
    source_count: int = 0
    fallback_used: bool = False


class DailyBriefingPaperItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    briefing_id: int = Field(index=True, foreign_key="dailybriefing.id")
    paper_id: int = Field(index=True, foreign_key="paper.id")
    rank: int
    score: float = 0.0
    reason: str = ""
    source_kind: str = ""


class DailyBriefingProjectItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    briefing_id: int = Field(index=True, foreign_key="dailybriefing.id")
    ingestion_item_id: int = Field(index=True, foreign_key="ingestionitem.id")
    rank: int
    title: str
    url: str = ""
    summary: str = ""
    source_kind: str = ""
```

```python
# backend/app/models/subscription.py
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Subscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: str = "arxiv"
    query: str = ""
    source_kind: str = "arxiv"
    display_name: str = ""
    config_json: str = "{}"
    fetch_limit: int = 10
    is_active: bool = True
    last_checked_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_error: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

```python
# backend/app/core/db.py
def _migrate_add_columns() -> None:
    import logging
    logger = logging.getLogger(__name__)
    if engine.url.drivername != "sqlite":
        return
    migrations = [
        ("paper", "tags_json", "TEXT DEFAULT '[]'"),
        ("paper", "primary_category_id", "INTEGER"),
        ("paper", "category_confidence", "REAL DEFAULT 0"),
        ("paper", "category_status", "TEXT DEFAULT 'pending_review'"),
        ("paper", "category_reason", "TEXT DEFAULT ''"),
        ("subscription", "source_kind", "TEXT DEFAULT 'arxiv'"),
        ("subscription", "display_name", "TEXT DEFAULT ''"),
        ("subscription", "config_json", "TEXT DEFAULT '{}'"),
        ("subscription", "fetch_limit", "INTEGER DEFAULT 10"),
        ("subscription", "last_success_at", "TIMESTAMP"),
        ("subscription", "last_error", "TEXT DEFAULT ''"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            if _column_exists(conn, table, column):
                continue
            conn.execute(__import__("sqlalchemy").text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            conn.commit()
            logger.info("Migration: added column %s.%s", table, column)
```

```python
# backend/app/main.py
from app.models.automation_settings import AutomationSettings  # noqa: F401
from app.models.daily_run import DailyRun, DailyBriefing, DailyBriefingPaperItem, DailyBriefingProjectItem  # noqa: F401
from app.models.ingestion_item import IngestionItem  # noqa: F401
```

- [ ] **Step 4: 重新运行测试，确认设置默认值与单行初始化成立**

Run: `cd backend && python -m pytest tests/test_automation_settings.py -q`

Expected: PASS，输出 `1 passed`。

---

## Task 2: 扩展订阅 API 与自动化设置 API

**Files:**
- Create: `backend/app/schemas/automation.py`
- Create: `backend/app/api/routes/automation.py`
- Modify: `backend/app/api/routes/subscriptions.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_automation_settings.py`

- [ ] **Step 1: 先写失败测试，锁定自动化设置读写接口与订阅扩展字段**

```python
# backend/tests/test_automation_settings.py
def test_automation_settings_api_updates_schedule(client) -> None:
    response = client.put(
        "/automation/settings",
        json={
            "enabled": True,
            "schedule_time": "08:30",
            "timezone": "Asia/Shanghai",
            "top_n": 7,
            "briefing_enabled": True,
            "project_sidebar_enabled": False,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["schedule_time"] == "08:30"
    assert body["top_n"] == 7
    assert body["project_sidebar_enabled"] is False


def test_create_subscription_accepts_source_kind_and_config(client) -> None:
    response = client.post(
        "/subscriptions",
        json={
            "name": "OpenReview ICLR",
            "type": "openreview",
            "source_kind": "openreview",
            "query": "iclr.cc",
            "fetch_limit": 20,
            "config": {"venue": "ICLR.cc/2025/Conference"},
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["source_kind"] == "openreview"
    assert body["fetch_limit"] == 20
    assert body["config"]["venue"] == "ICLR.cc/2025/Conference"
```

- [ ] **Step 2: 运行测试，确认新的 route 与 schema 尚未存在**

Run: `cd backend && python -m pytest tests/test_automation_settings.py -q`

Expected: FAIL，报 `/automation/settings` 为 404，或 `/subscriptions` 返回体缺少 `source_kind/config/fetch_limit`。

- [ ] **Step 3: 写最小 schema 与 route，让配置可读写、订阅可存多源配置**

```python
# backend/app/schemas/automation.py
from pydantic import BaseModel, Field


class AutomationSettingsResponse(BaseModel):
    enabled: bool
    schedule_time: str
    timezone: str
    top_n: int
    briefing_enabled: bool
    project_sidebar_enabled: bool


class AutomationSettingsUpdate(BaseModel):
    enabled: bool = True
    schedule_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    timezone: str
    top_n: int = Field(ge=1, le=20)
    briefing_enabled: bool = True
    project_sidebar_enabled: bool = True
```

```python
# backend/app/api/routes/automation.py
from fastapi import APIRouter

from app.schemas.automation import AutomationSettingsResponse, AutomationSettingsUpdate
from app.services.automation_settings_service import AutomationSettingsService

router = APIRouter(prefix="/automation", tags=["automation"])


@router.get("/settings", response_model=AutomationSettingsResponse)
def get_settings() -> AutomationSettingsResponse:
    row = AutomationSettingsService().get_settings()
    return AutomationSettingsResponse.model_validate(row, from_attributes=True)


@router.put("/settings", response_model=AutomationSettingsResponse)
def update_settings(payload: AutomationSettingsUpdate) -> AutomationSettingsResponse:
    row = AutomationSettingsService().update_settings(**payload.model_dump())
    return AutomationSettingsResponse.model_validate(row, from_attributes=True)
```

```python
# backend/app/api/routes/subscriptions.py
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.subscription import Subscription
from app.services.arxiv_client import search_arxiv

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


class SubscriptionCreate(BaseModel):
    name: str
    type: str = "arxiv"
    source_kind: str = "arxiv"
    query: str = ""
    fetch_limit: int = Field(default=10, ge=1, le=50)
    config: dict = Field(default_factory=dict)


class SubscriptionResponse(BaseModel):
    id: int
    name: str
    type: str
    source_kind: str
    query: str
    fetch_limit: int
    config: dict
    is_active: bool
    last_checked_at: str | None
    created_at: str


@router.post("", response_model=SubscriptionResponse, status_code=201)
def create_subscription(req: SubscriptionCreate, db: Session = Depends(get_session)) -> SubscriptionResponse:
    sub = Subscription(
        name=req.name,
        type=req.type,
        source_kind=req.source_kind,
        query=req.query,
        fetch_limit=req.fetch_limit,
        config_json=json.dumps(req.config, ensure_ascii=False),
        display_name=req.name,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return _to_response(sub)


def _to_response(s: Subscription) -> SubscriptionResponse:
    return SubscriptionResponse(
        id=s.id,
        name=s.name,
        type=s.type,
        source_kind=s.source_kind,
        query=s.query,
        fetch_limit=s.fetch_limit,
        config=json.loads(s.config_json or "{}"),
        is_active=s.is_active,
        last_checked_at=s.last_checked_at.isoformat() if s.last_checked_at else None,
        created_at=s.created_at.isoformat(),
    )
```

```python
# backend/app/main.py
from app.api.routes.automation import router as automation_router

app.include_router(automation_router, dependencies=protected_dependencies)
```

- [ ] **Step 4: 重新运行测试，确认配置 API 与多源订阅创建都成立**

Run: `cd backend && python -m pytest tests/test_automation_settings.py -q`

Expected: PASS，输出 `3 passed` 左右（包含 Task 1 测试）。

---

## Task 3: 建立统一 SourceAdapter 抽象与 registry

**Files:**
- Create: `backend/app/services/source_adapters/base.py`
- Create: `backend/app/services/source_adapters/registry.py`
- Create: `backend/app/services/source_adapters/__init__.py`
- Test: `backend/tests/test_source_adapters.py`

- [ ] **Step 1: 先写失败测试，锁定标准化候选项结构与 registry 映射**

```python
# backend/tests/test_source_adapters.py
from app.services.source_adapters.base import SourceCandidate
from app.services.source_adapters.registry import get_adapter


def test_registry_returns_expected_adapter_types() -> None:
    assert get_adapter("arxiv").source_kind == "arxiv"
    assert get_adapter("rss").source_kind == "rss"
    assert get_adapter("openreview").source_kind == "openreview"
    assert get_adapter("hf_papers").source_kind == "hf_papers"
    assert get_adapter("github_trending").source_kind == "github_trending"


def test_source_candidate_can_build_paper_fingerprint() -> None:
    candidate = SourceCandidate(
        artifact_type="paper",
        source_kind="arxiv",
        external_id="2501.12345",
        title="Learning to Commit",
        authors="A, B",
        abstract_raw="test",
        canonical_url="https://arxiv.org/abs/2501.12345",
        pdf_url="https://arxiv.org/pdf/2501.12345.pdf",
        published_at=None,
        metadata={},
    )

    assert candidate.fingerprint().startswith("ext:2501.12345")
```

- [ ] **Step 2: 运行测试，确认当前适配层尚未存在**

Run: `cd backend && python -m pytest tests/test_source_adapters.py -q`

Expected: FAIL，报 `ModuleNotFoundError` 或 registry / candidate 未定义。

- [ ] **Step 3: 写统一候选项与 adapter 基类**

```python
# backend/app/services/source_adapters/base.py
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class SourceCandidate:
    artifact_type: str
    source_kind: str
    external_id: str
    title: str
    authors: str
    abstract_raw: str
    canonical_url: str
    pdf_url: str
    published_at: datetime | None
    metadata: dict = field(default_factory=dict)

    def fingerprint(self) -> str:
        if self.external_id:
            return f"ext:{self.external_id}"
        if self.pdf_url:
            return f"pdf:{self.pdf_url}"
        if self.canonical_url:
            return f"url:{self.canonical_url}"
        normalized_title = "".join(self.title.lower().split())
        date_part = self.published_at.date().isoformat() if self.published_at else "na"
        return f"title:{normalized_title}:{date_part}"


class SourceAdapter:
    source_kind = "base"

    def fetch(self, subscription, since, limit: int) -> list[SourceCandidate]:
        raise NotImplementedError
```

```python
# backend/app/services/source_adapters/registry.py
from app.services.source_adapters.arxiv_adapter import ArxivAdapter
from app.services.source_adapters.github_trending_adapter import GithubTrendingAdapter
from app.services.source_adapters.hf_papers_adapter import HuggingFacePapersAdapter
from app.services.source_adapters.openreview_adapter import OpenReviewAdapter
from app.services.source_adapters.rss_adapter import RssAdapter


_REGISTRY = {
    "arxiv": ArxivAdapter(),
    "rss": RssAdapter(),
    "openreview": OpenReviewAdapter(),
    "hf_papers": HuggingFacePapersAdapter(),
    "github_trending": GithubTrendingAdapter(),
}


def get_adapter(source_kind: str):
    return _REGISTRY[source_kind]
```

```python
# backend/app/services/source_adapters/__init__.py
from app.services.source_adapters.base import SourceAdapter, SourceCandidate
from app.services.source_adapters.registry import get_adapter

__all__ = ["SourceAdapter", "SourceCandidate", "get_adapter"]
```

- [ ] **Step 4: 先给 5 个 adapter 建空壳，让 registry 能加载**

```python
# backend/app/services/source_adapters/arxiv_adapter.py
from app.services.source_adapters.base import SourceAdapter


class ArxivAdapter(SourceAdapter):
    source_kind = "arxiv"

    def fetch(self, subscription, since, limit: int):
        return []
```

```python
# backend/app/services/source_adapters/rss_adapter.py
from app.services.source_adapters.base import SourceAdapter


class RssAdapter(SourceAdapter):
    source_kind = "rss"

    def fetch(self, subscription, since, limit: int):
        return []
```

```python
# backend/app/services/source_adapters/openreview_adapter.py
from app.services.source_adapters.base import SourceAdapter


class OpenReviewAdapter(SourceAdapter):
    source_kind = "openreview"

    def fetch(self, subscription, since, limit: int):
        return []
```

```python
# backend/app/services/source_adapters/hf_papers_adapter.py
from app.services.source_adapters.base import SourceAdapter


class HuggingFacePapersAdapter(SourceAdapter):
    source_kind = "hf_papers"

    def fetch(self, subscription, since, limit: int):
        return []
```

```python
# backend/app/services/source_adapters/github_trending_adapter.py
from app.services.source_adapters.base import SourceAdapter


class GithubTrendingAdapter(SourceAdapter):
    source_kind = "github_trending"

    def fetch(self, subscription, since, limit: int):
        return []
```

- [ ] **Step 5: 重新运行测试，确认统一候选项与 registry 建立完成**

Run: `cd backend && python -m pytest tests/test_source_adapters.py -q`

Expected: PASS，输出 `2 passed`。

---

## Task 4: 实现 arXiv、RSS、GitHub Trending 三个最小可用 adapter

**Files:**
- Modify: `backend/app/services/source_adapters/arxiv_adapter.py`
- Modify: `backend/app/services/source_adapters/rss_adapter.py`
- Modify: `backend/app/services/source_adapters/github_trending_adapter.py`
- Modify: `backend/app/services/arxiv_client.py`
- Test: `backend/tests/test_source_adapters.py`

- [ ] **Step 1: 先写失败测试，锁定 3 个 source 的标准化输出**

```python
# backend/tests/test_source_adapters.py
from datetime import datetime, timezone
import json

from app.models.subscription import Subscription
from app.services.source_adapters.arxiv_adapter import ArxivAdapter
from app.services.source_adapters.github_trending_adapter import GithubTrendingAdapter
from app.services.source_adapters.rss_adapter import RssAdapter


def test_arxiv_adapter_maps_search_results(mocker) -> None:
    mocker.patch(
        "app.services.source_adapters.arxiv_adapter.search_arxiv",
        return_value=[
            {
                "title": "A Paper",
                "authors": "A, B",
                "abstract": "summary",
                "pdf_url": "https://arxiv.org/pdf/1.pdf",
                "arxiv_id": "2501.1",
                "published": "2026-04-19T00:00:00+00:00",
            }
        ],
    )
    sub = Subscription(name="a", source_kind="arxiv", query="llm", config_json="{}", fetch_limit=5)

    items = ArxivAdapter().fetch(sub, since=None, limit=5)

    assert len(items) == 1
    assert items[0].artifact_type == "paper"
    assert items[0].external_id == "2501.1"


def test_rss_adapter_maps_entries_with_paper_links(mocker) -> None:
    mocker.patch(
        "app.services.source_adapters.rss_adapter.feedparser.parse",
        return_value=type("Feed", (), {
            "entries": [
                {
                    "title": "RSS Paper",
                    "link": "https://example.com/paper",
                    "summary": "A summary",
                    "published_parsed": None,
                }
            ]
        })(),
    )
    sub = Subscription(name="rss", source_kind="rss", query="", config_json=json.dumps({"feed_url": "https://example.com/feed.xml"}), fetch_limit=10)

    items = RssAdapter().fetch(sub, since=None, limit=10)

    assert len(items) == 1
    assert items[0].artifact_type == "paper"
    assert items[0].canonical_url == "https://example.com/paper"


def test_github_trending_adapter_marks_items_as_project(mocker) -> None:
    html = """
    <article class="Box-row">
      <h2><a href="/openai/codex">openai / codex</a></h2>
      <p>AI coding agent</p>
    </article>
    """
    mock_response = mocker.Mock(status_code=200, text=html)
    mocker.patch("app.services.source_adapters.github_trending_adapter.httpx.get", return_value=mock_response)
    sub = Subscription(name="gh", source_kind="github_trending", query="", config_json=json.dumps({"language": "python"}), fetch_limit=10)

    items = GithubTrendingAdapter().fetch(sub, since=None, limit=10)

    assert len(items) == 1
    assert items[0].artifact_type == "project"
    assert items[0].canonical_url == "https://github.com/openai/codex"
```

- [ ] **Step 2: 安装 RSS 解析依赖并运行测试，确认适配器逻辑尚未实现**

```toml
# backend/pyproject.toml
[project]
dependencies = [
  "fastapi==0.115.12",
  "uvicorn[standard]==0.34.1",
  "sqlmodel==0.0.24",
  "pydantic-settings==2.8.1",
  "httpx==0.28.1",
  "python-multipart==0.0.20",
  "pyjwt>=2.12.1",
  "sentence-transformers>=5.4.0",
  "feedparser>=6.0.11",
]
```

Run: `cd backend && python -m pytest tests/test_source_adapters.py -q`

Expected: FAIL，报 adapter 返回空列表或字段映射不正确。

- [ ] **Step 3: 实现 arXiv adapter，复用已有 client**

```python
# backend/app/services/source_adapters/arxiv_adapter.py
from datetime import datetime
import json

from app.services.arxiv_client import search_arxiv
from app.services.source_adapters.base import SourceAdapter, SourceCandidate


class ArxivAdapter(SourceAdapter):
    source_kind = "arxiv"

    def fetch(self, subscription, since, limit: int):
        results = search_arxiv(subscription.query, max_results=limit)
        items: list[SourceCandidate] = []
        for item in results:
            published = item.get("published")
            published_at = datetime.fromisoformat(published) if published else None
            items.append(
                SourceCandidate(
                    artifact_type="paper",
                    source_kind=self.source_kind,
                    external_id=item.get("arxiv_id", ""),
                    title=item.get("title", ""),
                    authors=item.get("authors", ""),
                    abstract_raw=item.get("abstract", ""),
                    canonical_url=f"https://arxiv.org/abs/{item.get('arxiv_id', '')}" if item.get("arxiv_id") else item.get("pdf_url", ""),
                    pdf_url=item.get("pdf_url", ""),
                    published_at=published_at,
                    metadata={},
                )
            )
        return items
```

- [ ] **Step 4: 实现 RSS 与 GitHub Trending adapter，满足日报第一版发现能力**

```python
# backend/app/services/source_adapters/rss_adapter.py
from datetime import datetime, timezone
import json
import time

import feedparser

from app.services.source_adapters.base import SourceAdapter, SourceCandidate


class RssAdapter(SourceAdapter):
    source_kind = "rss"

    def fetch(self, subscription, since, limit: int):
        config = json.loads(subscription.config_json or "{}")
        feed_url = config["feed_url"]
        parsed = feedparser.parse(feed_url)
        items: list[SourceCandidate] = []
        for entry in parsed.entries[:limit]:
            struct_time = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
            published_at = datetime.fromtimestamp(time.mktime(struct_time), tz=timezone.utc) if struct_time else None
            items.append(
                SourceCandidate(
                    artifact_type="paper",
                    source_kind=self.source_kind,
                    external_id=getattr(entry, "id", "") or getattr(entry, "link", ""),
                    title=getattr(entry, "title", ""),
                    authors="",
                    abstract_raw=getattr(entry, "summary", ""),
                    canonical_url=getattr(entry, "link", ""),
                    pdf_url="",
                    published_at=published_at,
                    metadata={},
                )
            )
        return items
```

```python
# backend/app/services/source_adapters/github_trending_adapter.py
import json
import re

import httpx

from app.services.source_adapters.base import SourceAdapter, SourceCandidate


class GithubTrendingAdapter(SourceAdapter):
    source_kind = "github_trending"

    def fetch(self, subscription, since, limit: int):
        config = json.loads(subscription.config_json or "{}")
        language = config.get("language", "")
        url = "https://github.com/trending" + (f"/{language}" if language else "")
        response = httpx.get(url, follow_redirects=True, timeout=30.0)
        response.raise_for_status()
        html = response.text
        matches = re.findall(r'<h2><a href="(/[^"]+)">([^<]+)</a></h2>.*?<p>(.*?)</p>', html, flags=re.S)
        items: list[SourceCandidate] = []
        for href, raw_name, desc in matches[:limit]:
            repo_name = " ".join(raw_name.split())
            items.append(
                SourceCandidate(
                    artifact_type="project",
                    source_kind=self.source_kind,
                    external_id=href.strip("/"),
                    title=repo_name,
                    authors="",
                    abstract_raw=" ".join(desc.split()),
                    canonical_url=f"https://github.com{href}",
                    pdf_url="",
                    published_at=None,
                    metadata={},
                )
            )
        return items
```

- [ ] **Step 5: 重新运行测试，确认首批 3 个源可用**

Run: `cd backend && python -m pytest tests/test_source_adapters.py -q`

Expected: PASS，输出 `5 passed` 左右（含 Task 3 测试）。

---

## Task 5: 实现 OpenReview 与 Hugging Face Papers adapter

**Files:**
- Modify: `backend/app/services/source_adapters/openreview_adapter.py`
- Modify: `backend/app/services/source_adapters/hf_papers_adapter.py`
- Modify: `backend/tests/test_source_adapters.py`

- [ ] **Step 1: 先写失败测试，锁定 OpenReview 与 HF Papers 最小映射**

```python
# backend/tests/test_source_adapters.py
def test_openreview_adapter_maps_notes(mocker) -> None:
    payload = {
        "notes": [
            {
                "id": "or-1",
                "content": {
                    "title": {"value": "OpenReview Paper"},
                    "abstract": {"value": "OpenReview abstract"},
                    "authors": {"value": ["A", "B"]},
                    "pdf": {"value": "/pdf?id=or-1"},
                },
            }
        ]
    }
    mock_response = mocker.Mock(status_code=200)
    mock_response.json.return_value = payload
    mocker.patch("app.services.source_adapters.openreview_adapter.httpx.get", return_value=mock_response)

    sub = Subscription(name="or", source_kind="openreview", config_json='{"base_url":"https://api.openreview.net","invitation":"ICLR.cc/2025/Conference/-/Submission"}')
    items = OpenReviewAdapter().fetch(sub, since=None, limit=10)

    assert items[0].artifact_type == "paper"
    assert items[0].title == "OpenReview Paper"


def test_hf_papers_adapter_maps_cards(mocker) -> None:
    html = """
    <article>
      <a href="/papers/2501.12345">A HF Paper</a>
      <p>summary text</p>
    </article>
    """
    mock_response = mocker.Mock(status_code=200, text=html)
    mocker.patch("app.services.source_adapters.hf_papers_adapter.httpx.get", return_value=mock_response)

    sub = Subscription(name="hf", source_kind="hf_papers", config_json='{"url":"https://huggingface.co/papers"}')
    items = HuggingFacePapersAdapter().fetch(sub, since=None, limit=10)

    assert items[0].artifact_type == "paper"
    assert items[0].title == "A HF Paper"
```

- [ ] **Step 2: 运行测试，确认 2 个 adapter 仍为空壳**

Run: `cd backend && python -m pytest tests/test_source_adapters.py -q`

Expected: FAIL，报列表为空或字段未映射。

- [ ] **Step 3: 实现 OpenReview adapter**

```python
# backend/app/services/source_adapters/openreview_adapter.py
from datetime import datetime, timezone
import json

import httpx

from app.services.source_adapters.base import SourceAdapter, SourceCandidate


class OpenReviewAdapter(SourceAdapter):
    source_kind = "openreview"

    def fetch(self, subscription, since, limit: int):
        config = json.loads(subscription.config_json or "{}")
        base_url = config.get("base_url", "https://api.openreview.net")
        invitation = config["invitation"]
        response = httpx.get(
            f"{base_url}/notes",
            params={"invitation": invitation, "limit": limit},
            timeout=30.0,
        )
        response.raise_for_status()
        payload = response.json()
        items: list[SourceCandidate] = []
        for note in payload.get("notes", []):
            content = note.get("content", {})
            title = content.get("title", {}).get("value", "")
            abstract = content.get("abstract", {}).get("value", "")
            authors = ", ".join(content.get("authors", {}).get("value", []))
            pdf_value = content.get("pdf", {}).get("value", "")
            pdf_url = f"https://openreview.net{pdf_value}" if pdf_value.startswith("/") else pdf_value
            items.append(
                SourceCandidate(
                    artifact_type="paper",
                    source_kind=self.source_kind,
                    external_id=note.get("id", ""),
                    title=title,
                    authors=authors,
                    abstract_raw=abstract,
                    canonical_url=f"https://openreview.net/forum?id={note.get('id', '')}",
                    pdf_url=pdf_url,
                    published_at=None,
                    metadata={},
                )
            )
        return items
```

- [ ] **Step 4: 实现 Hugging Face Papers adapter**

```python
# backend/app/services/source_adapters/hf_papers_adapter.py
import json
import re

import httpx

from app.services.source_adapters.base import SourceAdapter, SourceCandidate


class HuggingFacePapersAdapter(SourceAdapter):
    source_kind = "hf_papers"

    def fetch(self, subscription, since, limit: int):
        config = json.loads(subscription.config_json or "{}")
        url = config.get("url", "https://huggingface.co/papers")
        response = httpx.get(url, timeout=30.0)
        response.raise_for_status()
        html = response.text
        matches = re.findall(r'<a href="(/papers/[^"]+)">([^<]+)</a>.*?<p>(.*?)</p>', html, flags=re.S)
        items: list[SourceCandidate] = []
        for href, title, desc in matches[:limit]:
            paper_slug = href.split("/")[-1]
            canonical_url = f"https://huggingface.co{href}"
            pdf_url = f"https://arxiv.org/pdf/{paper_slug}.pdf" if re.match(r"^\d{4}\.\d{4,5}", paper_slug) else ""
            items.append(
                SourceCandidate(
                    artifact_type="paper",
                    source_kind=self.source_kind,
                    external_id=paper_slug,
                    title=" ".join(title.split()),
                    authors="",
                    abstract_raw=" ".join(desc.split()),
                    canonical_url=canonical_url,
                    pdf_url=pdf_url,
                    published_at=None,
                    metadata={},
                )
            )
        return items
```

- [ ] **Step 5: 重新运行测试，确认 5 个 source adapter 全部可用**

Run: `cd backend && python -m pytest tests/test_source_adapters.py -q`

Expected: PASS，输出全部通过。

---

## Task 6: 实现 DailyIngestionService 与抓取记录持久化

> Status 2026-04-20: completed. The landed implementation is broader than the original skeleton: it supports injected or self-managed DB sessions, SourceAdapter registry fetching, paper/project split, PDF import, pipeline parse/summarize, deduplication, per-item failure recording, subscription status timestamps, and run stats persistence. Verified with `pytest tests/test_daily_ingestion.py tests/test_source_adapters.py tests/test_automation_settings.py tests/test_db_migrations.py -q` -> 32 passed.

**Files:**
- Create: `backend/app/services/daily_ingestion.py`
- Modify: `backend/app/services/pipeline.py`
- Modify: `backend/app/services/task_queue.py`
- Test: `backend/tests/test_daily_ingestion.py`

- [x] **Step 1: 先写失败测试，锁定去重、导入、项目侧栏分流行为**

```python
# backend/tests/test_daily_ingestion.py
import json
from datetime import date, datetime, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper
from app.models.subscription import Subscription
from app.services.daily_ingestion import DailyIngestionService


def test_daily_ingestion_imports_new_papers_and_skips_projects(mocker) -> None:
    with Session(engine) as session:
        subscription = Subscription(
            name="arxiv",
            source_kind="arxiv",
            query="llm",
            fetch_limit=10,
        )
        session.add(subscription)
        session.commit()
        session.refresh(subscription)

    mocker.patch(
        "app.services.daily_ingestion.get_adapter",
        return_value=type(
            "StubAdapter",
            (),
            {
                "fetch": lambda self, sub, since, limit: [
                    type("Candidate", (), {
                        "artifact_type": "paper",
                        "source_kind": "arxiv",
                        "external_id": "2501.12345",
                        "title": "A Paper",
                        "authors": "A",
                        "abstract_raw": "summary",
                        "canonical_url": "https://arxiv.org/abs/2501.12345",
                        "pdf_url": "https://arxiv.org/pdf/2501.12345.pdf",
                        "published_at": None,
                        "metadata": {},
                        "fingerprint": lambda self: "ext:2501.12345",
                    })(),
                    type("Candidate", (), {
                        "artifact_type": "project",
                        "source_kind": "github_trending",
                        "external_id": "openai/codex",
                        "title": "openai/codex",
                        "authors": "",
                        "abstract_raw": "AI coding agent",
                        "canonical_url": "https://github.com/openai/codex",
                        "pdf_url": "",
                        "published_at": None,
                        "metadata": {},
                        "fingerprint": lambda self: "ext:openai/codex",
                    })(),
                ]
            },
        )(),
    )
    mocker.patch("app.services.daily_ingestion.PaperPipelineService.parse_paper")
    mocker.patch("app.services.daily_ingestion.PaperPipelineService.summarize_paper")
    mocker.patch("app.services.daily_ingestion.PaperPipelineService.classify_primary_category")

    service = DailyIngestionService()
    run = service.run_for_date(date(2026, 4, 19), trigger_type="manual")

    with Session(engine) as session:
        papers = session.exec(select(Paper)).all()
        items = session.exec(select(IngestionItem)).all()

    assert run.status == "completed"
    assert len(papers) == 1
    assert len(items) == 2
```

- [x] **Step 2: 运行测试，确认编排服务尚未存在**

Run: `cd backend && python -m pytest tests/test_daily_ingestion.py -q`

Expected: FAIL，报 `ModuleNotFoundError` 或 `DailyIngestionService` 未定义。

- [x] **Step 3: 写最小编排服务，先完成抓取记录、去重、导入分流**

```python
# backend/app/services/daily_ingestion.py
import json
from datetime import date, datetime, time, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.models.daily_run import DailyRun
from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper
from app.models.subscription import Subscription
from app.services.source_adapters.registry import get_adapter


class DailyIngestionService:
    def run_for_date(self, run_date: date, trigger_type: str = "scheduled") -> DailyRun:
        scheduled_for = datetime.combine(run_date, time(hour=12, minute=0), tzinfo=timezone.utc)
        with Session(engine) as session:
            run = DailyRun(run_date=run_date, scheduled_for=scheduled_for, trigger_type=trigger_type)
            session.add(run)
            session.commit()
            session.refresh(run)

            subscriptions = session.exec(select(Subscription).where(Subscription.is_active == True)).all()
            stats = {"subscriptions": len(subscriptions), "papers_imported": 0, "projects_found": 0}

            for sub in subscriptions:
                adapter = get_adapter(sub.source_kind)
                candidates = adapter.fetch(sub, since=sub.last_checked_at, limit=sub.fetch_limit)
                for candidate in candidates:
                    item = IngestionItem(
                        daily_run_id=run.id,
                        subscription_id=sub.id,
                        source_kind=candidate.source_kind,
                        artifact_type=candidate.artifact_type,
                        external_id=candidate.external_id,
                        canonical_url=candidate.canonical_url,
                        pdf_url=candidate.pdf_url,
                        title=candidate.title,
                        authors=candidate.authors,
                        abstract_raw=candidate.abstract_raw,
                        published_at=candidate.published_at,
                        fingerprint=candidate.fingerprint(),
                        metadata_json=json.dumps(candidate.metadata, ensure_ascii=False),
                    )
                    session.add(item)
                    session.flush()

                    if candidate.artifact_type == "project":
                        item.status = "processed"
                        stats["projects_found"] += 1
                        session.add(item)
                        continue

                    exists = session.exec(select(Paper).where(Paper.source_id == candidate.external_id)).first()
                    if exists is not None:
                        item.paper_id = exists.id
                        item.status = "deduplicated"
                        session.add(item)
                        continue

                    paper = Paper(
                        title=candidate.title,
                        source=candidate.source_kind,
                        source_id=candidate.external_id,
                        authors=candidate.authors,
                        abstract_raw=candidate.abstract_raw,
                        pdf_url=candidate.pdf_url,
                        local_pdf_path="",
                        status="queued",
                    )
                    session.add(paper)
                    session.flush()

                    item.paper_id = paper.id
                    item.status = "imported"
                    session.add(item)
                    stats["papers_imported"] += 1

                sub.last_checked_at = datetime.now(timezone.utc)
                session.add(sub)

            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.stats_json = json.dumps(stats, ensure_ascii=False)
            session.add(run)
            session.commit()
            session.refresh(run)
            return run
```

- [x] **Step 4: 接上现有 PaperPipelineService，让论文可继续进入 parse/summarize**

```python
# backend/app/services/daily_ingestion.py
from app.models.paper_content import PaperContent
from app.services.pipeline import PaperPipelineService

# 在 paper 创建成功后，追加：
if candidate.pdf_url:
    paper.local_pdf_path = paper.local_pdf_path or ""
session.add(paper)
session.flush()

pipeline = PaperPipelineService()
try:
    # 第一版允许仅对可导入 PDF 的论文继续处理
    if paper.local_pdf_path:
        pipeline.parse_paper(session, paper)
        pipeline.summarize_paper(session, paper)
        item.status = "processed"
    else:
        item.status = "failed"
        item.error_message = "No local PDF path available for automated parsing."
except Exception as exc:
    item.status = "failed"
    item.error_message = str(exc)
session.add(item)
```

- [x] **Step 5: 重新运行测试，确认抓取记录、论文导入与项目分流成立**

Run: `cd backend && python -m pytest tests/test_daily_ingestion.py -q`

Expected: PASS，输出 `1 passed`。

---

## Task 7: 实现日报生成服务与新的 Briefing API

> Status 2026-04-20: completed. `/briefing/today`, `/briefing/{date}`, and `/briefing/history` now read persisted DailyBriefing snapshots. The implementation keeps compatibility fields for the early prototype schema while exposing the planned snapshot response contract. Verified with `pytest tests/test_daily_briefing_api.py tests/test_daily_ingestion.py tests/test_source_adapters.py tests/test_automation_settings.py tests/test_db_migrations.py -q` -> 35 passed.

**Files:**
- Create: `backend/app/schemas/briefing.py`
- Create: `backend/app/services/daily_briefing_service.py`
- Modify: `backend/app/api/routes/briefing.py`
- Test: `backend/tests/test_daily_briefing_api.py`

- [x] **Step 1: 先写失败测试，锁定“今天日报”快照结构**

```python
# backend/tests/test_daily_briefing_api.py
from datetime import date

from sqlmodel import Session

from app.core.db import engine
from app.models.daily_briefing import DailyBriefing, DailyBriefingPaperItem, DailyBriefingProjectItem
from app.models.daily_run import DailyRun
from app.models.paper import Paper


def test_briefing_today_returns_snapshot_payload(client) -> None:
    with Session(engine) as session:
        run = DailyRun(run_date=date(2026, 4, 19), scheduled_for="2026-04-19T04:00:00+00:00", status="completed")
        session.add(run)
        session.flush()
        paper = Paper(title="A Paper", source="arxiv", local_pdf_path="", status="ready", parse_status="completed", summary_status="completed")
        session.add(paper)
        session.flush()
        briefing = DailyBriefing(
            daily_run_id=run.id,
            briefing_date=date(2026, 4, 19),
            summary_markdown="今日共 1 篇论文完成处理。",
            paper_count=1,
            project_count=1,
            source_count=2,
        )
        session.add(briefing)
        session.flush()
        session.add(DailyBriefingPaperItem(briefing_id=briefing.id, paper_id=paper.id, rank=1, score=0.9, reason="值得优先阅读", source_kind="arxiv"))
        session.add(DailyBriefingProjectItem(briefing_id=briefing.id, ingestion_item_id=1, rank=1, title="openai/codex", url="https://github.com/openai/codex", summary="AI coding agent", source_kind="github_trending"))
        session.commit()

    response = client.get("/briefing/today")

    assert response.status_code == 200
    body = response.json()
    assert body["briefing_date"] == "2026-04-19"
    assert body["summary_markdown"] == "今日共 1 篇论文完成处理。"
    assert body["top_papers"][0]["reason"] == "值得优先阅读"
    assert body["projects"][0]["title"] == "openai/codex"
```

- [x] **Step 2: 运行测试，确认现有 briefing API 仍是全库实时统计**

Run: `cd backend && python -m pytest tests/test_daily_briefing_api.py -q`

Expected: FAIL，报响应结构与快照字段不匹配。

- [x] **Step 3: 写日报 schema 与生成服务，优先完成快照读取**

```python
# backend/app/schemas/briefing.py
from pydantic import BaseModel


class BriefingPaperItem(BaseModel):
    paper_id: int
    rank: int
    score: float
    reason: str
    source_kind: str


class BriefingProjectItem(BaseModel):
    rank: int
    title: str
    url: str
    summary: str
    source_kind: str


class DailyBriefingResponse(BaseModel):
    briefing_date: str
    status: str
    generated_at: str
    summary_markdown: str
    paper_count: int
    project_count: int
    source_count: int
    fallback_used: bool
    top_papers: list[BriefingPaperItem]
    projects: list[BriefingProjectItem]
```

```python
# backend/app/services/daily_briefing_service.py
from datetime import date

from sqlmodel import Session, select

from app.models.daily_briefing import DailyBriefing, DailyBriefingPaperItem, DailyBriefingProjectItem


class DailyBriefingService:
    def get_briefing_by_date(self, session: Session, briefing_date: date) -> DailyBriefing | None:
        return session.exec(
            select(DailyBriefing).where(DailyBriefing.briefing_date == briefing_date).order_by(DailyBriefing.generated_at.desc())
        ).first()

    def get_latest_successful(self, session: Session) -> DailyBriefing | None:
        return session.exec(
            select(DailyBriefing).where(DailyBriefing.status == "completed").order_by(DailyBriefing.generated_at.desc())
        ).first()

    def get_paper_items(self, session: Session, briefing_id: int) -> list[DailyBriefingPaperItem]:
        return list(
            session.exec(
                select(DailyBriefingPaperItem).where(DailyBriefingPaperItem.briefing_id == briefing_id).order_by(DailyBriefingPaperItem.rank)
            ).all()
        )

    def get_project_items(self, session: Session, briefing_id: int) -> list[DailyBriefingProjectItem]:
        return list(
            session.exec(
                select(DailyBriefingProjectItem).where(DailyBriefingProjectItem.briefing_id == briefing_id).order_by(DailyBriefingProjectItem.rank)
            ).all()
        )
```

- [x] **Step 4: 重写 `/briefing/today` 为快照读取，并增加 `/briefing/{date}` 与 history**

```python
# backend/app/api/routes/briefing.py
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db import get_session
from app.schemas.briefing import BriefingPaperItem, BriefingProjectItem, DailyBriefingResponse
from app.services.daily_briefing_service import DailyBriefingService

router = APIRouter(prefix="/briefing", tags=["briefing"])


def _to_response(service: DailyBriefingService, session: Session, briefing) -> DailyBriefingResponse:
    papers = service.get_paper_items(session, briefing.id)
    projects = service.get_project_items(session, briefing.id)
    return DailyBriefingResponse(
        briefing_date=briefing.briefing_date.isoformat(),
        status=briefing.status,
        generated_at=briefing.generated_at.isoformat(),
        summary_markdown=briefing.summary_markdown,
        paper_count=briefing.paper_count,
        project_count=briefing.project_count,
        source_count=briefing.source_count,
        fallback_used=briefing.fallback_used,
        top_papers=[
            BriefingPaperItem(
                paper_id=item.paper_id,
                rank=item.rank,
                score=item.score,
                reason=item.reason,
                source_kind=item.source_kind,
            )
            for item in papers
        ],
        projects=[
            BriefingProjectItem(
                rank=item.rank,
                title=item.title,
                url=item.url,
                summary=item.summary,
                source_kind=item.source_kind,
            )
            for item in projects
        ],
    )


@router.get("/today", response_model=DailyBriefingResponse)
def get_today_briefing(db: Session = Depends(get_session)) -> DailyBriefingResponse:
    service = DailyBriefingService()
    briefing = service.get_briefing_by_date(db, datetime.now().date()) or service.get_latest_successful(db)
    if briefing is None:
        raise HTTPException(status_code=404, detail="No daily briefing available.")
    return _to_response(service, db, briefing)
```

- [x] **Step 5: 重新运行测试，确认 briefing API 已切换为日报快照模式**

Run: `cd backend && python -m pytest tests/test_daily_briefing_api.py -q`

Expected: PASS，输出 `1 passed`。

---

## Task 8: 实现自动化运行 API 与手动补跑入口

> Status 2026-04-20: completed. Added `POST /automation/runs/today` for manual same-day ingestion runs and an in-process `AutomationScheduler` that checks the configured schedule and runs the daily ingestion once per local date. Verified with `pytest tests/test_automation_settings.py tests/test_source_adapters.py tests/test_daily_ingestion.py tests/test_daily_briefing_api.py tests/test_automation_scheduler.py tests/test_db_migrations.py -q` -> 38 passed.

**Files:**
- Modify: `backend/app/api/routes/automation.py`
- Create: `backend/app/services/automation_scheduler.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_daily_ingestion.py`

- [x] **Step 1: 先写失败测试，锁定“手动补跑今天日报”接口**

```python
# backend/tests/test_daily_ingestion.py
def test_manual_run_endpoint_dispatches_today_run(client, mocker) -> None:
    mock_run = type("Run", (), {"id": 3, "status": "running"})()
    mocker.patch("app.api.routes.automation.DailyIngestionService.run_for_date", return_value=mock_run)

    response = client.post("/automation/runs/today")

    assert response.status_code == 202
    assert response.json() == {"run_id": 3, "status": "running"}
```

- [x] **Step 2: 运行测试，确认 endpoint 尚未存在**

Run: `cd backend && python -m pytest tests/test_daily_ingestion.py -q`

Expected: FAIL，报 `/automation/runs/today` 为 404。

- [x] **Step 3: 增加手动补跑 route，第一版直接同步触发服务**

```python
# backend/app/api/routes/automation.py
from datetime import datetime

from fastapi import APIRouter

from app.schemas.automation import AutomationSettingsResponse, AutomationSettingsUpdate
from app.services.automation_settings_service import AutomationSettingsService
from app.services.daily_ingestion import DailyIngestionService

router = APIRouter(prefix="/automation", tags=["automation"])


@router.post("/runs/today", status_code=202)
def run_today() -> dict:
    run = DailyIngestionService().run_for_date(datetime.now().date(), trigger_type="manual")
    return {"run_id": run.id, "status": run.status}
```

- [x] **Step 4: 增加 scheduler 占位服务，并在 app 启动时加载配置**

```python
# backend/app/services/automation_scheduler.py
from app.services.automation_settings_service import AutomationSettingsService


class AutomationScheduler:
    def load_settings(self):
        return AutomationSettingsService().get_settings()

    def tick(self):
        # 第一版仅保留接口与配置读取点，后续再接真实定时轮询
        return self.load_settings()
```

```python
# backend/app/main.py
from app.services.automation_scheduler import AutomationScheduler


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    AutomationScheduler().load_settings()
    yield
```

- [x] **Step 5: 重新运行测试，确认补跑 API 已可用**

Run: `cd backend && python -m pytest tests/test_daily_ingestion.py -q`

Expected: PASS，相关测试通过。

---

## Task 9: 改造前端类型与 API 客户端，支持日报快照和自动化设置

> Status 2026-04-20: completed. Frontend types and API client now expose daily briefing snapshots, automation settings read/write, and manual daily run trigger. Verified with `vitest run src/lib/api.test.ts --reporter=dot` -> 10 passed.

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/api.test.ts`

- [x] **Step 1: 先写失败测试，锁定新的 briefing 与 automation API 读写契约**

```tsx
// frontend/src/lib/api.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchBriefing,
  fetchAutomationSettings,
  updateAutomationSettings,
  runTodayBriefing,
} from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('automation briefing api', () => {
  it('reads briefing snapshot payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      briefing_date: '2026-04-19',
      status: 'completed',
      generated_at: '2026-04-19T12:00:00+08:00',
      summary_markdown: '今日 Top 5',
      paper_count: 5,
      project_count: 3,
      source_count: 4,
      fallback_used: false,
      top_papers: [],
      projects: [],
    })))

    const result = await fetchBriefing()

    expect(result.briefing_date).toBe('2026-04-19')
    expect(result.top_papers).toEqual([])
  })

  it('updates automation settings', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      enabled: true,
      schedule_time: '12:00',
      timezone: 'Asia/Shanghai',
      top_n: 5,
      briefing_enabled: true,
      project_sidebar_enabled: true,
    })))

    const result = await updateAutomationSettings({
      enabled: true,
      schedule_time: '12:00',
      timezone: 'Asia/Shanghai',
      top_n: 5,
      briefing_enabled: true,
      project_sidebar_enabled: true,
    })

    expect(result.top_n).toBe(5)
  })

  it('dispatches today briefing run', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      run_id: 7,
      status: 'running',
    })))

    const result = await runTodayBriefing()

    expect(result.run_id).toBe(7)
  })
})
```

- [x] **Step 2: 运行测试，确认客户端契约尚未扩展**

Run: `cd frontend && npm test -- --run src/lib/api.test.ts`

Expected: FAIL，报 `fetchAutomationSettings / updateAutomationSettings / runTodayBriefing` 未导出，或 `fetchBriefing()` 返回结构不同。

- [x] **Step 3: 扩展类型，明确日报快照与自动化设置结构**

```tsx
// frontend/src/types.ts
export interface AutomationSettings {
  enabled: boolean
  schedule_time: string
  timezone: string
  top_n: number
  briefing_enabled: boolean
  project_sidebar_enabled: boolean
}

export interface BriefingPaperItem {
  paper_id: number
  rank: number
  score: number
  reason: string
  source_kind: string
}

export interface BriefingProjectItem {
  rank: number
  title: string
  url: string
  summary: string
  source_kind: string
}

export interface DailyBriefingSnapshot {
  briefing_date: string
  status: string
  generated_at: string
  summary_markdown: string
  paper_count: number
  project_count: number
  source_count: number
  fallback_used: boolean
  top_papers: BriefingPaperItem[]
  projects: BriefingProjectItem[]
}
```

```tsx
// frontend/src/lib/api.ts
import type { AutomationSettings, DailyBriefingSnapshot } from '../types'

export async function fetchAutomationSettings(): Promise<AutomationSettings> {
  const response = await fetch(`${API_BASE}/automation/settings`, { headers: getAuthHeaders() })
  return readJson(response)
}

export async function updateAutomationSettings(payload: AutomationSettings): Promise<AutomationSettings> {
  const response = await fetch(`${API_BASE}/automation/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  })
  return readJson(response)
}

export async function runTodayBriefing(): Promise<{ run_id: number; status: string }> {
  const response = await fetch(`${API_BASE}/automation/runs/today`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return readJson(response)
}

export async function fetchBriefing(date?: string): Promise<DailyBriefingSnapshot> {
  const path = date ? `${API_BASE}/briefing/${date}` : `${API_BASE}/briefing/today`
  const response = await fetch(path, { headers: getAuthHeaders() })
  return readJson(response)
}
```

- [x] **Step 4: 重新运行测试，确认前端 API 契约已切换**

Run: `cd frontend && npm test -- --run src/lib/api.test.ts`

Expected: PASS。

---

## Task 10: 重构 DailyBriefingShell 为日报快照视图

> Status 2026-04-20: completed. Work dashboard now renders persisted daily briefing snapshots with summary markdown, Top papers, and a separate related projects sidebar. Verified with `vitest run src/App.test.tsx --reporter=dot` -> 18 passed at Task 10 checkpoint.

**Files:**
- Create: `frontend/src/components/BriefingTopPapers.tsx`
- Create: `frontend/src/components/BriefingProjectsSidebar.tsx`
- Create: `frontend/src/components/BriefingHistoryPicker.tsx`
- Modify: `frontend/src/components/DailyBriefingShell.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/index.css`

- [x] **Step 1: 先写失败测试，锁定工作看板展示 Top 5 与项目侧栏**

```tsx
// frontend/src/App.test.tsx
it('renders daily briefing top papers and project sidebar on dashboard', async () => {
  apiMocks.fetchBriefing.mockResolvedValueOnce({
    briefing_date: '2026-04-19',
    status: 'completed',
    generated_at: '2026-04-19T12:00:00+08:00',
    summary_markdown: '今日最值得读的 5 篇论文',
    paper_count: 5,
    project_count: 2,
    source_count: 4,
    fallback_used: false,
    top_papers: [
      { paper_id: 1, rank: 1, score: 0.98, reason: '与 AI Coding 高度相关', source_kind: 'arxiv' },
    ],
    projects: [
      { rank: 1, title: 'openai/codex', url: 'https://github.com/openai/codex', summary: 'AI coding agent', source_kind: 'github_trending' },
    ],
  })

  renderAppAt('/briefing')

  expect(await screen.findByText('今日最值得读的 5 篇论文')).toBeInTheDocument()
  expect(screen.getByText('与 AI Coding 高度相关')).toBeInTheDocument()
  expect(screen.getByText('openai/codex')).toBeInTheDocument()
})
```

- [x] **Step 2: 运行测试，确认现有 shell 仍在显示旧的全库概览**

Run: `cd frontend && npm test -- --run src/App.test.tsx`

Expected: FAIL，报找不到 Top 5 理由或项目侧栏标题。

- [x] **Step 3: 拆出 Top 5 与项目侧栏组件，减少 DailyBriefingShell 复杂度**

```tsx
// frontend/src/components/BriefingTopPapers.tsx
import type { DailyBriefingSnapshot, Paper } from '../types'

export function BriefingTopPapers({
  briefing,
  papers,
  onOpenPaper,
}: {
  briefing: DailyBriefingSnapshot
  papers: Paper[]
  onOpenPaper: (paperId: number) => void
}) {
  return (
    <div className="briefing-top-papers">
      {briefing.top_papers.map((item) => {
        const paper = papers.find(p => p.id === item.paper_id)
        return (
          <article key={item.paper_id} className="briefing-top-paper-card" onClick={() => onOpenPaper(item.paper_id)}>
            <div className="briefing-top-paper-rank">#{item.rank}</div>
            <h3>{paper?.title ?? `论文 ${item.paper_id}`}</h3>
            <p>{item.reason}</p>
          </article>
        )
      })}
    </div>
  )
}
```

```tsx
// frontend/src/components/BriefingProjectsSidebar.tsx
import type { DailyBriefingSnapshot } from '../types'

export function BriefingProjectsSidebar({ briefing }: { briefing: DailyBriefingSnapshot }) {
  if (briefing.projects.length === 0) return null

  return (
    <aside className="briefing-projects-sidebar">
      <h3>相关项目</h3>
      <ol>
        {briefing.projects.map((project) => (
          <li key={`${project.rank}-${project.title}`}>
            <a href={project.url} target="_blank" rel="noreferrer">{project.title}</a>
            <p>{project.summary}</p>
          </li>
        ))}
      </ol>
    </aside>
  )
}
```

```tsx
// frontend/src/components/BriefingHistoryPicker.tsx
export function BriefingHistoryPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <label className="briefing-history-picker">
      <span>日期</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
```

- [x] **Step 4: 重写 DailyBriefingShell，让它消费快照 API 而不是 papers 本地统计**

```tsx
// frontend/src/components/DailyBriefingShell.tsx
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { fetchBriefing } from '../lib/api'
import type { DailyBriefingSnapshot, Paper } from '../types'
import { BriefingHistoryPicker } from './BriefingHistoryPicker'
import { BriefingProjectsSidebar } from './BriefingProjectsSidebar'
import { BriefingTopPapers } from './BriefingTopPapers'

export function DailyBriefingShell({
  papers,
  onOpenPaper,
}: {
  papers: Paper[]
  onOpenPaper: (paperId: number) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  const [briefing, setBriefing] = useState<DailyBriefingSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const data = await fetchBriefing(selectedDate === today ? undefined : selectedDate)
        setBriefing(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载日报失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedDate])

  if (loading) {
    return <section className="panel-card briefing-shell">正在加载每日速览...</section>
  }

  if (error || !briefing) {
    return <section className="panel-card briefing-shell">{error || '暂无日报'}</section>
  }

  return (
    <section className="panel-card briefing-shell">
      <header className="panel-header">
        <div>
          <h2>每日速览</h2>
          <p>{briefing.briefing_date} · {new Date(briefing.generated_at).toLocaleString('zh-CN')}</p>
        </div>
        <BriefingHistoryPicker value={selectedDate} onChange={setSelectedDate} />
      </header>

      <div className="briefing-grid">
        <article className="briefing-main">
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {briefing.summary_markdown}
            </ReactMarkdown>
          </div>

          <BriefingTopPapers briefing={briefing} papers={papers} onOpenPaper={onOpenPaper} />
        </article>

        <div className="briefing-side-stack">
          <aside className="briefing-side">
            <h3>今日论文 ({briefing.paper_count})</h3>
            <ol>
              {briefing.top_papers.map(item => {
                const paper = papers.find(p => p.id === item.paper_id)
                return <li key={item.paper_id}>{paper?.title ?? `论文 ${item.paper_id}`}</li>
              })}
            </ol>
          </aside>
          <BriefingProjectsSidebar briefing={briefing} />
        </div>
      </div>
    </section>
  )
}
```

- [x] **Step 5: 补上基础样式并重新运行测试**

```css
/* frontend/src/index.css */
.briefing-top-papers {
  display: grid;
  gap: 16px;
  margin-top: 24px;
}

.briefing-top-paper-card {
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-layer-1);
  padding: 18px;
  cursor: pointer;
}

.briefing-top-paper-rank {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--bg-selected);
  color: var(--accent-blue);
  margin-bottom: 12px;
}

.briefing-side-stack {
  display: grid;
  gap: 20px;
}

.briefing-projects-sidebar {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-layer-1);
  padding: 20px;
}
```

Run: `cd frontend && npm test -- --run src/App.test.tsx`

Expected: PASS。

---

## Task 11: 加入自动化设置面板与“立即补跑今天日报”操作

> Status 2026-04-20: completed. Added AutomationSettingsPanel, surfaced schedule/top-n/timezone controls in the dashboard, and wired the manual "run today" action. Verified with `vitest run src/App.test.tsx --reporter=dot` -> 19 passed.

**Files:**
- Create: `frontend/src/components/AutomationSettingsPanel.tsx`
- Modify: `frontend/src/components/DailyBriefingShell.tsx`
- Modify: `frontend/src/App.test.tsx`

- [x] **Step 1: 先写失败测试，锁定设置面板读写与补跑按钮**

```tsx
// frontend/src/App.test.tsx
it('updates automation settings and triggers today briefing run', async () => {
  apiMocks.fetchAutomationSettings.mockResolvedValueOnce({
    enabled: true,
    schedule_time: '12:00',
    timezone: 'Asia/Shanghai',
    top_n: 5,
    briefing_enabled: true,
    project_sidebar_enabled: true,
  })
  apiMocks.updateAutomationSettings.mockResolvedValueOnce({
    enabled: true,
    schedule_time: '13:00',
    timezone: 'Asia/Shanghai',
    top_n: 5,
    briefing_enabled: true,
    project_sidebar_enabled: true,
  })
  apiMocks.runTodayBriefing.mockResolvedValueOnce({ run_id: 3, status: 'running' })

  renderAppAt('/briefing')

  fireEvent.click(await screen.findByRole('button', { name: '自动化设置' }))
  fireEvent.change(screen.getByLabelText('生成时间'), { target: { value: '13:00' } })
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
  fireEvent.click(screen.getByRole('button', { name: '立即补跑今天日报' }))

  await waitFor(() => expect(apiMocks.updateAutomationSettings).toHaveBeenCalled())
  await waitFor(() => expect(apiMocks.runTodayBriefing).toHaveBeenCalled())
})
```

- [x] **Step 2: 运行测试，确认设置 UI 尚未存在**

Run: `cd frontend && npm test -- --run src/App.test.tsx`

Expected: FAIL，报按钮不存在。

- [x] **Step 3: 实现设置面板组件**

```tsx
// frontend/src/components/AutomationSettingsPanel.tsx
import { useEffect, useState } from 'react'

import { fetchAutomationSettings, updateAutomationSettings } from '../lib/api'
import type { AutomationSettings } from '../types'

export function AutomationSettingsPanel() {
  const [settings, setSettings] = useState<AutomationSettings | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetchAutomationSettings().then(setSettings).catch(() => {})
  }, [])

  async function handleSave() {
    if (!settings) return
    const next = await updateAutomationSettings(settings)
    setSettings(next)
    setOpen(false)
  }

  if (!settings) return null

  return (
    <div className="automation-settings">
      <button type="button" onClick={() => setOpen(v => !v)}>自动化设置</button>
      {open ? (
        <div className="automation-settings-card">
          <label>
            <span>生成时间</span>
            <input
              aria-label="生成时间"
              type="time"
              value={settings.schedule_time}
              onChange={(event) => setSettings({ ...settings, schedule_time: event.target.value })}
            />
          </label>
          <label>
            <span>时区</span>
            <input
              aria-label="时区"
              value={settings.timezone}
              onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}
            />
          </label>
          <button type="button" onClick={() => void handleSave()}>保存设置</button>
        </div>
      ) : null}
    </div>
  )
}
```

- [x] **Step 4: 将设置面板和补跑按钮接入 DailyBriefingShell**

```tsx
// frontend/src/components/DailyBriefingShell.tsx
import { runTodayBriefing } from '../lib/api'
import { AutomationSettingsPanel } from './AutomationSettingsPanel'

// 在 header 中追加
<div className="briefing-header-actions">
  <AutomationSettingsPanel />
  <button type="button" onClick={() => void runTodayBriefing()}>
    立即补跑今天日报
  </button>
</div>
```

- [x] **Step 5: 重新运行测试，确认设置与补跑操作可达**

Run: `cd frontend && npm test -- --run src/App.test.tsx`

Expected: PASS。

---

## Task 12: 端到端回归与完成验证

> Status 2026-04-20: automated verification completed. Backend regression, frontend API/page tests, and frontend production build were executed successfully. `npm run build` completed with the existing Vite chunk-size warning only. Browser-based manual acceptance is still optional/not run in this session.

**Files:**
- Test: `backend/tests/test_automation_settings.py`
- Test: `backend/tests/test_source_adapters.py`
- Test: `backend/tests/test_daily_ingestion.py`
- Test: `backend/tests/test_daily_briefing_api.py`
- Test: `frontend/src/lib/api.test.ts`
- Test: `frontend/src/App.test.tsx`
- Verify: `backend/app/api/routes/automation.py`
- Verify: `backend/app/api/routes/briefing.py`
- Verify: `frontend/src/components/DailyBriefingShell.tsx`

- [x] **Step 1: 运行后端回归测试，确认模型、adapter、编排、briefing API 一致**

Run:

```bash
cd backend
python -m pytest \
  tests/test_automation_settings.py \
  tests/test_source_adapters.py \
  tests/test_daily_ingestion.py \
  tests/test_daily_briefing_api.py -q
```

Expected: PASS，所有与本功能相关测试通过。

- [x] **Step 2: 运行前端 API 与页面回归测试**

Run:

```bash
cd frontend
npm test -- --run src/lib/api.test.ts src/App.test.tsx
```

Expected: PASS。

- [x] **Step 3: 运行前端构建，确认类型和路由集成无误**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS，`vite build` 完成且没有 TypeScript 错误。

- [ ] **Step 4: 人工验收工作看板**

验收清单：

- 打开 `/briefing` 能看到日报日期、生成时间、Top 5、项目侧栏
- 修改“生成时间”后刷新页面仍能读到新值
- 点击“立即补跑今天日报”可以触发后端接口
- GitHub Trending 项目只在“相关项目”侧栏出现，不会出现在论文 Top 5
- 当 API 没有今日快照时，页面能显示错误或最近一期回退结果

---

## 验证顺序

按以下顺序执行，不要跳步：

1. `cd backend && python -m pytest tests/test_automation_settings.py -q`
2. `cd backend && python -m pytest tests/test_source_adapters.py -q`
3. `cd backend && python -m pytest tests/test_daily_ingestion.py -q`
4. `cd backend && python -m pytest tests/test_daily_briefing_api.py -q`
5. `cd frontend && npm test -- --run src/lib/api.test.ts`
6. `cd frontend && npm test -- --run src/App.test.tsx`
7. `cd frontend && npm run build`

---

## 交付完成标准

完成本计划后，应满足以下验收条件：

- 后端可以持久化全局自动化设置
- 订阅支持 `source_kind + config_json + fetch_limit`
- 5 个 source adapter 全部具备最小抓取能力
- 每日编排器可以生成 `DailyRun / IngestionItem`
- 日报 API 返回快照而不是全库实时拼装
- 工作看板展示 Top 5、日报摘要和 GitHub 项目侧栏
- 前端可以修改自动化时间并触发手动补跑
- 论文 Top 5 与项目侧栏严格分口径

---

## Spec Coverage Self-Review

### 已覆盖的 spec 要求

- 多源首批落地：Task 3 / 4 / 5
- 全局自动化设置并开放 UI：Task 1 / 2 / 11
- 每日编排与运行记录：Task 6 / 8
- 日报快照化：Task 7
- 工作看板展示 Top 5 + 项目侧栏：Task 10
- GitHub Trending 不参与论文排序：Task 4 / 10

### 占位词检查

已手动检查本计划，不包含：

- 英文任务占位词
- 英文未决占位词
- “后续补充实现细节”
- “适当处理错误” 这类无操作指令

### 命名一致性检查

统一使用以下命名，不混用：

- `AutomationSettings`
- `DailyRun`
- `IngestionItem`
- `DailyBriefing`
- `SourceCandidate`
- `DailyIngestionService`
- `DailyBriefingService`
