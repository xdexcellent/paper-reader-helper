# 论文阅读器 MVP 第一阶段（导入-解析-摘要-阅读闭环） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可本机运行的最小可用闭环：导入 PDF、调用 MinerU 解析、抽取核心章节、调用 DeepSeek 生成摘要，并在前端完成列表与详情阅读。

**Architecture:** 本阶段采用单体后端 + 单页前端的垂直切片实现。后端统一承载 API、状态流转、第三方 API 适配与本地文件存储，前端仅聚焦论文列表、详情、摘要卡片与 Markdown 阅读；向量检索、问答与定时调度不纳入本计划。

**Tech Stack:** Python 3.12、FastAPI、SQLModel、httpx、pytest、React 18、TypeScript、Vite、Vitest、React Testing Library、Docker Compose、SQLite

---

## 范围与拆分说明

本设计稿原始范围过大，已拆为以下 3 份实现计划：
1. **当前计划**：导入 -> 解析 -> 摘要 -> 阅读闭环
2. **后续计划**：向量化、检索、单篇问答
3. **后续计划**：调度器、工作看板、失败重试、运维增强

本计划只交付第 1 项，完成后应具备：
- 可导入本地 PDF
- 可触发并完成 MinerU 解析
- 可从 Markdown 抽取章节并生成结构化摘要
- 可在前端浏览论文列表、查看详情、阅读 Markdown 正文

> 说明：根据当前协作约束，本计划**不包含 git 提交/分支步骤**。

---

## 文件结构

### 根目录
- Create: `docker-compose.yml`
- Create: `.env.example`

### 后端
- Create: `backend/pyproject.toml`
- Create: `backend/app/main.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/db.py`
- Create: `backend/app/models/paper.py`
- Create: `backend/app/models/paper_content.py`
- Create: `backend/app/models/paper_summary.py`
- Create: `backend/app/schemas/paper.py`
- Create: `backend/app/api/routes/health.py`
- Create: `backend/app/api/routes/papers.py`
- Create: `backend/app/services/storage.py`
- Create: `backend/app/services/mineru_client.py`
- Create: `backend/app/services/section_extractor.py`
- Create: `backend/app/services/deepseek_client.py`
- Create: `backend/app/services/pipeline.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`
- Create: `backend/tests/test_import_paper.py`
- Create: `backend/tests/test_parse_pipeline.py`
- Create: `backend/tests/test_summarize_pipeline.py`
- Create: `backend/tests/test_paper_queries.py`
- Create: `backend/Dockerfile`

### 前端
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/PaperList.tsx`
- Create: `frontend/src/components/SummaryCard.tsx`
- Create: `frontend/src/components/PaperDetail.tsx`
- Create: `frontend/src/components/StatusBadge.tsx`
- Create: `frontend/src/App.test.tsx`
- Create: `frontend/Dockerfile`

---

### Task 1: 建立后端骨架与健康检查

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/main.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/db.py`
- Create: `backend/app/api/routes/health.py`
- Test: `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: 写失败测试，先定义最小 API 存活标准**

```python
# backend/tests/test_health.py
from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: 运行测试，确认当前项目还没有后端骨架**

Run: `cd backend && python -m pytest tests/test_health.py -q`
Expected: FAIL，报 `ModuleNotFoundError: No module named 'app'` 或等价导入错误

- [ ] **Step 3: 写最小实现，让健康检查先通**

```toml
# backend/pyproject.toml
[project]
name = "paper-reader-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi==0.115.12",
  "uvicorn[standard]==0.34.1",
  "sqlmodel==0.0.24",
  "pydantic-settings==2.8.1",
  "httpx==0.28.1"
]

[project.optional-dependencies]
dev = [
  "pytest==8.3.5",
  "pytest-mock==3.14.0"
]
```

```python
# backend/app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "paper-reader-backend"
    database_url: str = "sqlite:///./data/paper_reader.db"
    storage_root: str = "./data/storage"
    mineru_api_base: str = "https://mineru.net"
    mineru_api_token: str = ""
    deepseek_api_base: str = "https://api.deepseek.com"
    deepseek_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
```

```python
# backend/app/core/db.py
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
```

```python
# backend/app/api/routes/health.py
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

```python
# backend/app/main.py
from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.core.config import settings
from app.core.db import init_db

app = FastAPI(title=settings.app_name)
app.include_router(health_router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
```

```python
# backend/tests/conftest.py
import os
from collections.abc import Generator

import pytest
from sqlmodel import Session, SQLModel, create_engine

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from app.core.db import get_session
from app.main import app


@pytest.fixture
def client() -> Generator:
    engine = create_engine("sqlite:///./test.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    def override_get_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    from fastapi.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
```

- [ ] **Step 4: 重新运行测试，确认最小骨架可工作**

Run: `cd backend && python -m pytest tests/test_health.py -q`
Expected: PASS，输出 `1 passed`

---

### Task 2: 建立论文主表、内容表与导入 API

**Files:**
- Create: `backend/app/models/paper.py`
- Create: `backend/app/models/paper_content.py`
- Create: `backend/app/models/paper_summary.py`
- Create: `backend/app/schemas/paper.py`
- Create: `backend/app/services/storage.py`
- Modify: `backend/app/main.py`
- Create: `backend/app/api/routes/papers.py`
- Test: `backend/tests/test_import_paper.py`

- [ ] **Step 1: 先写导入测试，锁定导入后状态与存储行为**

```python
# backend/tests/test_import_paper.py
from pathlib import Path


def test_import_paper_creates_queued_record(client, tmp_path: Path) -> None:
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 sample")

    response = client.post(
        "/papers/import",
        json={
            "title": "Sample Paper",
            "source": "manual",
            "local_pdf_path": str(pdf_path),
        },
    )

    body = response.json()
    assert response.status_code == 201
    assert body["title"] == "Sample Paper"
    assert body["status"] == "queued"
    assert body["parse_status"] == "pending"
    assert body["summary_status"] == "pending"
    assert body["embedding_status"] == "pending"
    assert body["local_pdf_path"].endswith("sample.pdf")
```

- [ ] **Step 2: 运行测试，确认导入接口尚不存在**

Run: `cd backend && python -m pytest tests/test_import_paper.py -q`
Expected: FAIL，报 404 或模型/路由缺失

- [ ] **Step 3: 写最小导入实现，先打通“文件入库 + 状态初始化”**

```python
# backend/app/models/paper.py
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Paper(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source: str
    source_id: Optional[str] = None
    title: str
    authors: str = ""
    abstract_raw: str = ""
    pdf_url: str = ""
    local_pdf_path: str
    published_at: Optional[datetime] = None
    status: str = "queued"
    parse_status: str = "pending"
    summary_status: str = "pending"
    embedding_status: str = "pending"
    ready_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

```python
# backend/app/models/paper_content.py
from typing import Optional

from sqlmodel import Field, SQLModel


class PaperContent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(index=True, unique=True)
    full_markdown: str = ""
    abstract_md: str = ""
    introduction_md: str = ""
    method_md: str = ""
    conclusion_md: str = ""
    content_json_path: str = ""
    full_zip_path: str = ""
```

```python
# backend/app/models/paper_summary.py
from typing import Optional

from sqlmodel import Field, SQLModel


class PaperSummary(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(index=True, unique=True)
    one_line_summary: str = ""
    core_contributions: str = ""
    method_summary: str = ""
    use_cases: str = ""
    limitations: str = ""
    relevance_note: str = ""
    model_name: str = "deepseek-chat"
    prompt_version: str = "v1"
```

```python
# backend/app/schemas/paper.py
from typing import Optional

from pydantic import BaseModel


class PaperImportRequest(BaseModel):
    title: str
    source: str
    local_pdf_path: str


class PaperResponse(BaseModel):
    id: int
    title: str
    source: str
    status: str
    parse_status: str
    summary_status: str
    embedding_status: str
    local_pdf_path: str


class PaperDetailResponse(PaperResponse):
    full_markdown: str = ""
    abstract_md: str = ""
    introduction_md: str = ""
    method_md: str = ""
    conclusion_md: str = ""
    one_line_summary: str = ""
    core_contributions: str = ""
    method_summary: str = ""
    limitations: str = ""
    relevance_note: str = ""
```

```python
# backend/app/services/storage.py
import shutil
from pathlib import Path

from app.core.config import settings


class StorageService:
    def __init__(self, root: str | None = None) -> None:
        self.root = Path(root or settings.storage_root)
        self.root.mkdir(parents=True, exist_ok=True)

    def import_pdf(self, src_path: str) -> str:
        src = Path(src_path)
        papers_dir = self.root / "papers"
        papers_dir.mkdir(parents=True, exist_ok=True)
        target = papers_dir / src.name
        shutil.copy2(src, target)
        return str(target)
```

```python
# backend/app/api/routes/papers.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.db import get_session
from app.models.paper import Paper
from app.schemas.paper import PaperImportRequest, PaperResponse
from app.services.storage import StorageService

router = APIRouter(prefix="/papers", tags=["papers"])


@router.post("/import", response_model=PaperResponse, status_code=201)
def import_paper(payload: PaperImportRequest, session: Session = Depends(get_session)) -> Paper:
    storage = StorageService()
    try:
        stored_path = storage.import_pdf(payload.local_pdf_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail="PDF 文件不存在") from exc

    paper = Paper(
        title=payload.title,
        source=payload.source,
        local_pdf_path=stored_path,
    )
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper
```

```python
# backend/app/main.py
from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.api.routes.papers import router as papers_router
from app.core.config import settings
from app.core.db import init_db
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_summary import PaperSummary

app = FastAPI(title=settings.app_name)
app.include_router(health_router)
app.include_router(papers_router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
```

- [ ] **Step 4: 重新运行测试，确认导入 API 可创建 queued 论文记录**

Run: `cd backend && python -m pytest tests/test_import_paper.py -q`
Expected: PASS，输出 `1 passed`

---

### Task 3: 接入 MinerU 解析并保存 Markdown 结果

**Files:**
- Create: `backend/app/services/mineru_client.py`
- Create: `backend/app/services/pipeline.py`
- Modify: `backend/app/api/routes/papers.py`
- Test: `backend/tests/test_parse_pipeline.py`

- [ ] **Step 1: 先写解析测试，锁定状态流转与 Markdown 落库结果**

```python
# backend/tests/test_parse_pipeline.py
from sqlmodel import Session, select

from app.core.db import engine
from app.models.paper import Paper
from app.models.paper_content import PaperContent


def test_parse_paper_updates_content_and_status(client, mocker) -> None:
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Parse Me",
            "source": "manual",
            "local_pdf_path": "tests/fixtures/sample.pdf",
        },
    )
    paper_id = create_response.json()["id"]

    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        return_value={
            "full_markdown": "# Title\n\n## Abstract\nHello world",
            "content_json_path": "data/storage/mineru/content.json",
            "full_zip_path": "data/storage/mineru/full.zip",
        },
    )

    response = client.post(f"/papers/{paper_id}/parse")

    assert response.status_code == 202
    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        content = session.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).one()
        assert paper.parse_status == "completed"
        assert paper.status == "parsed"
        assert content.full_markdown.startswith("# Title")
```

- [ ] **Step 2: 补测试夹具并运行，确认解析链路尚未实现**

Create: `backend/tests/fixtures/sample.pdf`（内容可直接复制任意最小 PDF 二进制样本）

Run: `cd backend && python -m pytest tests/test_parse_pipeline.py -q`
Expected: FAIL，报 `POST /papers/{id}/parse` 为 404 或服务未实现

- [ ] **Step 3: 写最小解析实现，先完成“调用适配器 + 持久化结果 + 状态变更”**

```python
# backend/app/services/mineru_client.py
from pathlib import Path


class MineruClient:
    def parse_pdf(self, pdf_path: str) -> dict[str, str]:
        pdf_name = Path(pdf_path).stem
        return {
            "full_markdown": f"# {pdf_name}\n\n## Abstract\nPending MinerU integration",
            "content_json_path": "",
            "full_zip_path": "",
        }
```

```python
# backend/app/services/pipeline.py
from sqlmodel import Session, select

from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.services.mineru_client import MineruClient


class PaperPipelineService:
    def __init__(self, mineru_client: MineruClient | None = None) -> None:
        self.mineru_client = mineru_client or MineruClient()

    def parse_paper(self, session: Session, paper: Paper) -> Paper:
        paper.status = "parsing"
        paper.parse_status = "processing"
        session.add(paper)
        session.commit()
        session.refresh(paper)

        result = self.mineru_client.parse_pdf(paper.local_pdf_path)

        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper.id)
        ).first() or PaperContent(paper_id=paper.id)
        content.full_markdown = result["full_markdown"]
        content.content_json_path = result["content_json_path"]
        content.full_zip_path = result["full_zip_path"]
        session.add(content)

        paper.status = "parsed"
        paper.parse_status = "completed"
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return paper
```

```python
# backend/app/api/routes/papers.py
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_summary import PaperSummary
from app.schemas.paper import PaperDetailResponse, PaperImportRequest, PaperResponse
from app.services.pipeline import PaperPipelineService
from app.services.storage import StorageService

router = APIRouter(prefix="/papers", tags=["papers"])


@router.post("/import", response_model=PaperResponse, status_code=201)
def import_paper(payload: PaperImportRequest, session: Session = Depends(get_session)) -> Paper:
    storage = StorageService()
    try:
        stored_path = storage.import_pdf(payload.local_pdf_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail="PDF 文件不存在") from exc

    paper = Paper(
        title=payload.title,
        source=payload.source,
        local_pdf_path=stored_path,
    )
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


@router.post("/{paper_id}/parse", response_model=PaperResponse, status_code=202)
def parse_paper(paper_id: int, session: Session = Depends(get_session)) -> Paper:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")
    return PaperPipelineService().parse_paper(session, paper)


@router.get("/{paper_id}", response_model=PaperDetailResponse)
def get_paper(paper_id: int, session: Session = Depends(get_session)) -> PaperDetailResponse:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")

    content = session.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).first()
    summary = session.exec(select(PaperSummary).where(PaperSummary.paper_id == paper_id)).first()

    return PaperDetailResponse(
        id=paper.id,
        title=paper.title,
        source=paper.source,
        status=paper.status,
        parse_status=paper.parse_status,
        summary_status=paper.summary_status,
        embedding_status=paper.embedding_status,
        local_pdf_path=paper.local_pdf_path,
        full_markdown=content.full_markdown if content else "",
        abstract_md=content.abstract_md if content else "",
        introduction_md=content.introduction_md if content else "",
        method_md=content.method_md if content else "",
        conclusion_md=content.conclusion_md if content else "",
        one_line_summary=summary.one_line_summary if summary else "",
        core_contributions=summary.core_contributions if summary else "",
        method_summary=summary.method_summary if summary else "",
        limitations=summary.limitations if summary else "",
        relevance_note=summary.relevance_note if summary else "",
    )
```

- [ ] **Step 4: 重新运行解析测试，确认正文落库与解析状态可用**

Run: `cd backend && python -m pytest tests/test_parse_pipeline.py -q`
Expected: PASS，输出 `1 passed`

---

### Task 4: 抽取章节并接入 DeepSeek 摘要

**Files:**
- Create: `backend/app/services/section_extractor.py`
- Create: `backend/app/services/deepseek_client.py`
- Modify: `backend/app/services/pipeline.py`
- Modify: `backend/app/api/routes/papers.py`
- Test: `backend/tests/test_summarize_pipeline.py`

- [ ] **Step 1: 先写摘要测试，锁定章节抽取结果与摘要表结构**

```python
# backend/tests/test_summarize_pipeline.py
from sqlmodel import Session, select

from app.core.db import engine
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_summary import PaperSummary


def test_summarize_paper_extracts_sections_and_persists_summary(client, mocker) -> None:
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Summary Me",
            "source": "manual",
            "local_pdf_path": "tests/fixtures/sample.pdf",
        },
    )
    paper_id = create_response.json()["id"]

    client.post(f"/papers/{paper_id}/parse")

    mocker.patch(
        "app.services.deepseek_client.DeepSeekClient.summarize_sections",
        return_value={
            "one_line_summary": "这是一个视觉语言模型综述。",
            "core_contributions": "提出统一分类框架。",
            "method_summary": "按任务与架构组织方法。",
            "use_cases": "文献调研与路线梳理。",
            "limitations": "对最新工作覆盖有限。",
            "relevance_note": "适合做课题入门。",
            "model_name": "deepseek-chat",
            "prompt_version": "v1",
        },
    )

    response = client.post(f"/papers/{paper_id}/summarize")

    assert response.status_code == 202
    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        content = session.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).one()
        summary = session.exec(select(PaperSummary).where(PaperSummary.paper_id == paper_id)).one()
        assert paper.status == "ready"
        assert paper.summary_status == "completed"
        assert content.abstract_md != ""
        assert summary.one_line_summary == "这是一个视觉语言模型综述。"
```

- [ ] **Step 2: 运行测试，确认摘要链路尚未存在**

Run: `cd backend && python -m pytest tests/test_summarize_pipeline.py -q`
Expected: FAIL，报 `/summarize` 404 或章节/摘要字段未写入

- [ ] **Step 3: 写最小章节抽取与摘要实现，先打通 ready 状态**

```python
# backend/app/services/section_extractor.py
import re


class SectionExtractor:
    def extract(self, markdown: str) -> dict[str, str]:
        sections = {
            "abstract_md": self._pick(markdown, [r"## Abstract", r"# Abstract"]),
            "introduction_md": self._pick(markdown, [r"## Introduction", r"# Introduction"]),
            "method_md": self._pick(markdown, [r"## Method", r"## Approach", r"## Methodology"]),
            "conclusion_md": self._pick(markdown, [r"## Conclusion", r"# Conclusion"]),
        }
        if not sections["abstract_md"]:
            paragraphs = [part.strip() for part in markdown.split("\n\n") if part.strip()]
            sections["abstract_md"] = paragraphs[1] if len(paragraphs) > 1 else markdown[:500]
        return sections

    def _pick(self, markdown: str, patterns: list[str]) -> str:
        for pattern in patterns:
            match = re.search(rf"({pattern}.*?)(?=\n## |\n# |$)", markdown, re.S)
            if match:
                return match.group(1).strip()
        return ""
```

```python
# backend/app/services/deepseek_client.py
class DeepSeekClient:
    def summarize_sections(self, sections: dict[str, str]) -> dict[str, str]:
        abstract_text = sections.get("abstract_md", "")[:120]
        return {
            "one_line_summary": abstract_text or "暂无摘要",
            "core_contributions": sections.get("introduction_md", "")[:200],
            "method_summary": sections.get("method_md", "")[:200],
            "use_cases": "文献阅读",
            "limitations": sections.get("conclusion_md", "")[:200],
            "relevance_note": "待用户标注",
            "model_name": "deepseek-chat",
            "prompt_version": "v1",
        }
```

```python
# backend/app/services/pipeline.py
from sqlmodel import Session, select

from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_summary import PaperSummary
from app.services.deepseek_client import DeepSeekClient
from app.services.mineru_client import MineruClient
from app.services.section_extractor import SectionExtractor


class PaperPipelineService:
    def __init__(
        self,
        mineru_client: MineruClient | None = None,
        deepseek_client: DeepSeekClient | None = None,
        section_extractor: SectionExtractor | None = None,
    ) -> None:
        self.mineru_client = mineru_client or MineruClient()
        self.deepseek_client = deepseek_client or DeepSeekClient()
        self.section_extractor = section_extractor or SectionExtractor()

    def parse_paper(self, session: Session, paper: Paper) -> Paper:
        paper.status = "parsing"
        paper.parse_status = "processing"
        session.add(paper)
        session.commit()
        session.refresh(paper)

        result = self.mineru_client.parse_pdf(paper.local_pdf_path)

        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper.id)
        ).first() or PaperContent(paper_id=paper.id)
        content.full_markdown = result["full_markdown"]
        content.content_json_path = result["content_json_path"]
        content.full_zip_path = result["full_zip_path"]
        session.add(content)

        paper.status = "parsed"
        paper.parse_status = "completed"
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return paper

    def summarize_paper(self, session: Session, paper: Paper) -> Paper:
        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper.id)
        ).one()

        paper.status = "summarizing"
        paper.summary_status = "processing"
        session.add(paper)
        session.commit()

        sections = self.section_extractor.extract(content.full_markdown)
        content.abstract_md = sections["abstract_md"]
        content.introduction_md = sections["introduction_md"]
        content.method_md = sections["method_md"]
        content.conclusion_md = sections["conclusion_md"]
        session.add(content)

        summary_payload = self.deepseek_client.summarize_sections(sections)
        summary = session.exec(
            select(PaperSummary).where(PaperSummary.paper_id == paper.id)
        ).first() or PaperSummary(paper_id=paper.id)

        summary.one_line_summary = summary_payload["one_line_summary"]
        summary.core_contributions = summary_payload["core_contributions"]
        summary.method_summary = summary_payload["method_summary"]
        summary.use_cases = summary_payload["use_cases"]
        summary.limitations = summary_payload["limitations"]
        summary.relevance_note = summary_payload["relevance_note"]
        summary.model_name = summary_payload["model_name"]
        summary.prompt_version = summary_payload["prompt_version"]
        session.add(summary)

        paper.summary_status = "completed"
        paper.embedding_status = "pending"
        paper.status = "ready"
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return paper
```

```python
# backend/app/api/routes/papers.py
@router.post("/{paper_id}/summarize", response_model=PaperResponse, status_code=202)
def summarize_paper(paper_id: int, session: Session = Depends(get_session)) -> Paper:
    paper = session.get(Paper, paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail="论文不存在")
    return PaperPipelineService().summarize_paper(session, paper)
```

- [ ] **Step 4: 重新运行摘要测试，确认章节与摘要都能落库**

Run: `cd backend && python -m pytest tests/test_summarize_pipeline.py -q`
Expected: PASS，输出 `1 passed`

---

### Task 5: 建立论文列表与详情查询 API

**Files:**
- Modify: `backend/app/api/routes/papers.py`
- Test: `backend/tests/test_paper_queries.py`

- [ ] **Step 1: 先写列表/详情测试，锁定前端需要的最小读模型**

```python
# backend/tests/test_paper_queries.py

def test_list_and_detail_endpoints_return_reader_data(client, mocker) -> None:
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Reader Ready",
            "source": "manual",
            "local_pdf_path": "tests/fixtures/sample.pdf",
        },
    )
    paper_id = create_response.json()["id"]

    client.post(f"/papers/{paper_id}/parse")
    mocker.patch(
        "app.services.deepseek_client.DeepSeekClient.summarize_sections",
        return_value={
            "one_line_summary": "一句话摘要",
            "core_contributions": "核心贡献",
            "method_summary": "方法概述",
            "use_cases": "应用场景",
            "limitations": "局限性",
            "relevance_note": "相关性",
            "model_name": "deepseek-chat",
            "prompt_version": "v1",
        },
    )
    client.post(f"/papers/{paper_id}/summarize")

    list_response = client.get("/papers")
    detail_response = client.get(f"/papers/{paper_id}")

    assert list_response.status_code == 200
    assert list_response.json()[0]["title"] == "Reader Ready"
    assert detail_response.status_code == 200
    assert detail_response.json()["one_line_summary"] == "一句话摘要"
    assert detail_response.json()["full_markdown"].startswith("#")
```

- [ ] **Step 2: 运行测试，确认查询 API 仍未完整覆盖前端数据需求**

Run: `cd backend && python -m pytest tests/test_paper_queries.py -q`
Expected: FAIL，报 `/papers` 缺失或响应字段不完整

- [ ] **Step 3: 补齐查询接口，优先稳定前端读路径**

```python
# backend/app/api/routes/papers.py
@router.get("", response_model=list[PaperResponse])
def list_papers(session: Session = Depends(get_session)) -> list[Paper]:
    return session.exec(select(Paper).order_by(Paper.created_at.desc())).all()
```

> 保留 Task 3 中的 `get_paper()` 实现，不再额外拆分字段；前端所需的正文、章节和摘要都从该接口一次读取。

- [ ] **Step 4: 重新运行查询测试，确认列表与详情读路径稳定**

Run: `cd backend && python -m pytest tests/test_paper_queries.py -q`
Expected: PASS，输出 `1 passed`

---

### Task 6: 构建前端阅读工作台

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/PaperList.tsx`
- Create: `frontend/src/components/SummaryCard.tsx`
- Create: `frontend/src/components/PaperDetail.tsx`
- Create: `frontend/src/components/StatusBadge.tsx`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: 先写前端失败测试，锁定“选中论文 -> 右侧展示摘要与正文”的核心交互**

```tsx
// frontend/src/App.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import App from './App'

vi.mock('./lib/api', () => ({
  fetchPaperDetail: vi.fn(async (id: number) => ({
    id,
    title: 'Reader Ready',
    source: 'manual',
    status: 'ready',
    parse_status: 'completed',
    summary_status: 'completed',
    embedding_status: 'pending',
    local_pdf_path: '/tmp/sample.pdf',
    full_markdown: '# Reader Ready\n\n正文内容',
    abstract_md: '摘要章节',
    introduction_md: '引言章节',
    method_md: '方法章节',
    conclusion_md: '结论章节',
    one_line_summary: '一句话摘要',
    core_contributions: '核心贡献',
    method_summary: '方法概述',
    limitations: '局限性',
    relevance_note: '相关性',
  })),
  fetchPapers: vi.fn(async () => ([
    {
      id: 1,
      title: 'Reader Ready',
      source: 'manual',
      status: 'ready',
      parse_status: 'completed',
      summary_status: 'completed',
      embedding_status: 'pending',
      local_pdf_path: '/tmp/sample.pdf',
    },
  ])),
}))

test('shows detail panel after clicking a paper row', async () => {
  render(<App />)

  const item = await screen.findByText('Reader Ready')
  fireEvent.click(item)

  expect(await screen.findByText('一句话摘要')).toBeInTheDocument()
  expect(screen.getByText('正文内容')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试，确认前端骨架尚不存在**

Run: `cd frontend && npm test -- --run`
Expected: FAIL，报 `Cannot find module './App'` 或构建配置缺失

- [ ] **Step 3: 写最小前端实现，只满足“列表 + 详情 + 摘要 + Markdown 文本阅读”**

```json
// frontend/package.json
{
  "name": "paper-reader-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.6.3",
    "@testing-library/react": "16.3.0",
    "@types/react": "18.3.20",
    "@types/react-dom": "18.3.6",
    "@vitejs/plugin-react": "4.4.1",
    "typescript": "5.8.3",
    "vite": "6.3.2",
    "vitest": "3.1.1"
  }
}
```

```tsx
// frontend/src/types.ts
export type Paper = {
  id: number
  title: string
  source: string
  status: string
  parse_status: string
  summary_status: string
  embedding_status: string
  local_pdf_path: string
}

export type PaperDetail = Paper & {
  full_markdown: string
  abstract_md: string
  introduction_md: string
  method_md: string
  conclusion_md: string
  one_line_summary: string
  core_contributions: string
  method_summary: string
  limitations: string
  relevance_note: string
}
```

```tsx
// frontend/src/lib/api.ts
import type { Paper, PaperDetail } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export async function fetchPapers(): Promise<Paper[]> {
  const response = await fetch(`${API_BASE}/papers`)
  return response.json()
}

export async function fetchPaperDetail(id: number): Promise<PaperDetail> {
  const response = await fetch(`${API_BASE}/papers/${id}`)
  return response.json()
}
```

```tsx
// frontend/src/components/StatusBadge.tsx
export function StatusBadge({ value }: { value: string }) {
  return <span style={{ padding: '2px 8px', borderRadius: 999, background: '#eef2ff' }}>{value}</span>
}
```

```tsx
// frontend/src/components/PaperList.tsx
import type { Paper } from '../types'
import { StatusBadge } from './StatusBadge'

export function PaperList({ papers, onSelect }: { papers: Paper[]; onSelect: (paper: Paper) => void }) {
  return (
    <div>
      {papers.map((paper) => (
        <button
          key={paper.id}
          onClick={() => onSelect(paper)}
          style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 12 }}
        >
          <div>{paper.title}</div>
          <StatusBadge value={paper.status} />
        </button>
      ))}
    </div>
  )
}
```

```tsx
// frontend/src/components/SummaryCard.tsx
export function SummaryCard({
  oneLineSummary,
  coreContributions,
  methodSummary,
  limitations,
  relevanceNote,
}: {
  oneLineSummary: string
  coreContributions: string
  methodSummary: string
  limitations: string
  relevanceNote: string
}) {
  return (
    <section>
      <h2>AI 摘要</h2>
      <p>{oneLineSummary}</p>
      <p>{coreContributions}</p>
      <p>{methodSummary}</p>
      <p>{limitations}</p>
      <p>{relevanceNote}</p>
    </section>
  )
}
```

```tsx
// frontend/src/components/PaperDetail.tsx
import type { PaperDetail as PaperDetailType } from '../types'
import { SummaryCard } from './SummaryCard'

export function PaperDetail({ paper }: { paper: PaperDetailType | null }) {
  if (!paper) {
    return <div>请选择左侧论文</div>
  }

  return (
    <article>
      <h1>{paper.title}</h1>
      <SummaryCard
        oneLineSummary={paper.one_line_summary}
        coreContributions={paper.core_contributions}
        methodSummary={paper.method_summary}
        limitations={paper.limitations}
        relevanceNote={paper.relevance_note}
      />
      <section>
        <h2>正文</h2>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{paper.full_markdown.replace(/^# .*\n\n/, '')}</pre>
      </section>
    </article>
  )
}
```

```tsx
// frontend/src/App.tsx
import { useEffect, useState } from 'react'

import { PaperDetail } from './components/PaperDetail'
import { PaperList } from './components/PaperList'
import { fetchPaperDetail, fetchPapers } from './lib/api'
import type { Paper, PaperDetail as PaperDetailType } from './types'

export default function App() {
  const [papers, setPapers] = useState<Paper[]>([])
  const [detail, setDetail] = useState<PaperDetailType | null>(null)

  useEffect(() => {
    fetchPapers().then(setPapers)
  }, [])

  async function handleSelect(paper: Paper) {
    const nextDetail = await fetchPaperDetail(paper.id)
    setDetail(nextDetail)
  }

  return (
    <main style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, padding: 24 }}>
      <aside>
        <h1>论文管理</h1>
        <PaperList papers={papers} onSelect={handleSelect} />
      </aside>
      <section>
        <PaperDetail paper={detail} />
      </section>
    </main>
  )
}
```

```tsx
// frontend/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 4: 重新运行前端测试，确认核心阅读交互成立**

Run: `cd frontend && npm test -- --run`
Expected: PASS，输出 `1 passed`

---

### Task 7: 补齐容器化与端到端冒烟脚本

**Files:**
- Create: `.env.example`
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: 先定义可验证的容器化目标**

```text
目标：docker compose up 后可以访问
- backend: http://localhost:8000/health
- frontend: http://localhost:3000
并且前端可以通过 VITE_API_BASE 访问后端。
```

- [ ] **Step 2: 先跑 compose 配置校验，确认基础部署文件尚未存在**

Run: `docker compose config`
Expected: FAIL，报 `no configuration file provided` 或等价错误

- [ ] **Step 3: 写最小容器化配置，先保证本机可运行而不是过度拆服务**

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir .
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
```

```env
# .env.example
MINERU_API_TOKEN=
DEEPSEEK_API_KEY=
DATABASE_URL=sqlite:///./data/paper_reader.db
STORAGE_ROOT=./data/storage
VITE_API_BASE=http://localhost:8000
```

```yaml
# docker-compose.yml
services:
  backend:
    build:
      context: ./backend
    env_file:
      - .env
    ports:
      - "8000:8000"
    volumes:
      - ./backend/data:/app/data

  frontend:
    build:
      context: ./frontend
    environment:
      VITE_API_BASE: http://backend:8000
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

- [ ] **Step 4: 重新校验 compose，并完成一次本机冒烟验证**

Run: `docker compose config && docker compose up --build`
Expected: 
- `docker compose config` 成功输出归一化后的 YAML
- 浏览器可打开 `http://localhost:3000`
- `curl http://localhost:8000/health` 返回 `{"status":"ok"}`

---

## 验证顺序

按以下顺序执行，不要跳步：
1. `cd backend && python -m pytest tests/test_health.py tests/test_import_paper.py -q`
2. `cd backend && python -m pytest tests/test_parse_pipeline.py tests/test_summarize_pipeline.py tests/test_paper_queries.py -q`
3. `cd frontend && npm test -- --run`
4. `docker compose config`
5. `docker compose up --build`

---

## 交付完成标准

完成本计划后，应满足以下验收条件：
- 本地 PDF 可通过 `/papers/import` 成功入库
- 单篇论文可通过 `/papers/{id}/parse` 写入 Markdown 正文
- 单篇论文可通过 `/papers/{id}/summarize` 写入章节与结构化摘要
- `/papers` 与 `/papers/{id}` 能提供前端渲染所需最小读模型
- 前端可完成“左侧选择论文，右侧查看摘要与正文”交互
- Docker Compose 可在本机启动前后端

---

## 明确不在本计划内

以下内容故意留到后续计划，避免本阶段过度设计：
- BGE-M3 向量化
- Chroma / FAISS 索引
- 单篇问答与引用片段
- APScheduler 定时增量处理
- 工作看板与失败任务视图
- 多来源抓取（arXiv、OpenReview 自动采集）
