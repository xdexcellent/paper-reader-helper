import httpx
import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from app.models.ingestion_item import IngestionItem
from app.models.paper import Paper
from app.models.spis_settings import SpisSettings
from app.services.category_service import ensure_default_categories
from app.services.spis_fallback_service import (
    SPIS_BLOCKED_GLOBAL,
    SPIS_FAILED,
    SPIS_MANUAL_REQUIRED,
    SPIS_RECOVERED,
    SpisFallbackResult,
    SpisFallbackService,
    classify_spis_page,
    parse_spis_html,
)
from app.services.spis_settings_service import SpisSettingsService


LOGIN_HTML = """
<html><body>
  <form action="/login" method="post">
    <input type="text" name="username" />
    <input type="password" name="password" />
    <input type="submit" value="登录" />
  </form>
  <div>请登录后继续访问</div>
</body></html>
"""

HOME_SEARCH_HTML = """
<html><body>
  <form action="/search" method="get">
    <input type="text" name="q" placeholder="关键词" />
    <input type="submit" value="检索" />
  </form>
  <div>已登录</div>
</body></html>
"""

SEARCH_DIRECT_HTML = """
<html><body>
  <a href="/files/paper.pdf">直接下载 PDF</a>
  <a href="https://doi.org/10.1/example">来源链接</a>
</body></html>
"""

SEARCH_HELP_HTML = """
<html><body>
  <div>仅支持文献求助</div>
  <a href="/help/request">文献求助</a>
  <a href="https://publisher.example/article">来源链接</a>
</body></html>
"""

SEARCH_NONE_HTML = """
<html><body>
  <div>未找到相关结果</div>
</body></html>
"""


class _FakeTransport(httpx.BaseTransport):
    def __init__(self, routes: dict[tuple[str, str], httpx.Response | list[httpx.Response]]) -> None:
        self.routes = routes
        self.calls: list[tuple[str, str, str]] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        key = (request.method.upper(), str(request.url))
        path_key = (request.method.upper(), request.url.path)
        self.calls.append((request.method.upper(), str(request.url), request.content.decode("utf-8", errors="ignore")))
        response = self.routes.get(key) or self.routes.get(path_key)
        if response is None:
            return httpx.Response(404, request=request, text="not found")
        if isinstance(response, list):
            if not response:
                return httpx.Response(500, request=request, text="exhausted")
            current = response.pop(0)
            return httpx.Response(
                current.status_code,
                headers=current.headers,
                content=current.content,
                request=request,
            )
        return httpx.Response(
            response.status_code,
            headers=response.headers,
            content=response.content,
            request=request,
        )


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        ensure_default_categories(session)
    yield engine


def _enable_spis(session: Session, *, account: str = "user", password: str = "pass") -> None:
    settings = SpisSettingsService.get_settings(session)
    settings.account = account
    settings.password = password
    settings.enabled = True
    session.add(settings)
    session.commit()


def test_parse_spis_html_detects_direct_pdf_and_help_only() -> None:
    direct = parse_spis_html(SEARCH_DIRECT_HTML)
    assert direct["direct_pdf_links"]
    assert classify_spis_page(direct).status == "direct_pdf_found"

    help_only = parse_spis_html(SEARCH_HELP_HTML)
    classified = classify_spis_page(help_only)
    assert classified is not None
    assert classified.status == SPIS_MANUAL_REQUIRED
    assert classified.manual_action_required is True


def test_attempt_for_candidate_recovers_direct_pdf(session_factory, tmp_path) -> None:
    transport = _FakeTransport(
        {
            ("GET", "/"): httpx.Response(200, text=HOME_SEARCH_HTML),
            ("GET", "/search"): httpx.Response(200, text=SEARCH_DIRECT_HTML),
            ("GET", "/files/paper.pdf"): httpx.Response(
                200,
                content=b"%PDF-1.4\n%%EOF\n",
                headers={"content-type": "application/pdf"},
            ),
        }
    )

    def client_factory(**kwargs):
        return httpx.Client(transport=transport, base_url="https://spis.example", follow_redirects=True)

    class _Pipeline:
        def __init__(self) -> None:
            self.parsed = False
            self.summarized = False

        def parse_paper(self, session, paper):
            self.parsed = True
            paper.parse_status = "completed"
            paper.status = "parsed"
            session.add(paper)
            session.commit()
            return paper

        def summarize_paper(self, session, paper, model=None):
            self.summarized = True
            paper.summary_status = "completed"
            paper.status = "ready"
            session.add(paper)
            session.commit()
            return paper

    pipeline = _Pipeline()
    with Session(session_factory) as session:
        _enable_spis(session)
        paper = Paper(
            source="crossref",
            title="Recoverable Paper",
            authors="Alice",
            local_pdf_path="",
            doi="10.1/example",
            source_pdf_status="restricted",
            spis_status="available_for_rescue",
        )
        session.add(paper)
        session.commit()
        session.refresh(paper)

        service = SpisFallbackService(
            client_factory=client_factory,
            storage_service=__import__("app.services.storage", fromlist=["StorageService"]).StorageService(
                root=str(tmp_path / "storage")
            ),
            pipeline_factory=lambda: pipeline,
            base_url="https://spis.example/",
        )
        result = service.attempt_for_paper(session, paper, run_pipeline_on_success=True)
        session.refresh(paper)

    assert result.status == SPIS_RECOVERED
    assert paper.local_pdf_path
    assert paper.source_pdf_status == "available"
    assert paper.spis_status == SPIS_RECOVERED
    assert pipeline.parsed is True
    assert pipeline.summarized is True


def test_attempt_for_candidate_manual_required_does_not_submit_help(session_factory, tmp_path) -> None:
    transport = _FakeTransport(
        {
            ("GET", "/"): httpx.Response(200, text=HOME_SEARCH_HTML),
            ("GET", "/search"): httpx.Response(200, text=SEARCH_HELP_HTML),
        }
    )

    def client_factory(**kwargs):
        return httpx.Client(transport=transport, base_url="https://spis.example", follow_redirects=True)

    with Session(session_factory) as session:
        _enable_spis(session)
        paper = Paper(
            source="crossref",
            title="Help Only Paper",
            local_pdf_path="",
            doi="10.2/help",
            source_pdf_status="metadata_only",
        )
        session.add(paper)
        session.commit()
        session.refresh(paper)

        service = SpisFallbackService(
            client_factory=client_factory,
            storage_service=__import__("app.services.storage", fromlist=["StorageService"]).StorageService(
                root=str(tmp_path / "storage")
            ),
            base_url="https://spis.example/",
        )
        result = service.attempt_for_paper(session, paper, run_pipeline_on_success=False)
        session.refresh(paper)

    assert result.status == SPIS_MANUAL_REQUIRED
    assert result.manual_action_required is True
    assert paper.spis_status == SPIS_MANUAL_REQUIRED
    assert "文献求助" in paper.spis_reason
    assert not any("/help/request" in call[1] and call[0] == "POST" for call in transport.calls)


def test_global_blocker_fail_fast_on_bad_credentials(session_factory, tmp_path) -> None:
    transport = _FakeTransport(
        {
            ("GET", "/"): httpx.Response(200, text=LOGIN_HTML),
            ("POST", "/login"): httpx.Response(200, text="<html><body>用户名或密码错误</body></html>"),
        }
    )

    def client_factory(**kwargs):
        return httpx.Client(transport=transport, base_url="https://spis.example", follow_redirects=True)

    with Session(session_factory) as session:
        _enable_spis(session, account="bad", password="bad")
        service = SpisFallbackService(
            client_factory=client_factory,
            storage_service=__import__("app.services.storage", fromlist=["StorageService"]).StorageService(
                root=str(tmp_path / "storage")
            ),
            base_url="https://spis.example/",
        )
        first = service.attempt_for_candidate(session, title="A", doi="10.1/a")
        second = service.attempt_for_candidate(session, title="B", doi="10.1/b")

    assert first.status == SPIS_BLOCKED_GLOBAL
    assert second.status == SPIS_BLOCKED_GLOBAL
    assert second.context.get("inherited") is True
    # second candidate should short-circuit without another login attempt
    post_logins = [call for call in transport.calls if call[0] == "POST" and "/login" in call[1]]
    assert len(post_logins) == 1


def test_no_results_returns_failed(session_factory, tmp_path) -> None:
    transport = _FakeTransport(
        {
            ("GET", "/"): httpx.Response(200, text=HOME_SEARCH_HTML),
            ("GET", "/search"): httpx.Response(200, text=SEARCH_NONE_HTML),
        }
    )

    def client_factory(**kwargs):
        return httpx.Client(transport=transport, base_url="https://spis.example", follow_redirects=True)

    with Session(session_factory) as session:
        _enable_spis(session)
        service = SpisFallbackService(
            client_factory=client_factory,
            storage_service=__import__("app.services.storage", fromlist=["StorageService"]).StorageService(
                root=str(tmp_path / "storage")
            ),
            base_url="https://spis.example/",
        )
        result = service.attempt_for_candidate(session, title="Missing Paper", doi="10.9/missing")

    assert result.status == SPIS_FAILED
    assert "未找到" in result.reason


def test_manual_force_bypasses_enabled_switch(session_factory, tmp_path) -> None:
    transport = _FakeTransport(
        {
            ("GET", "/"): httpx.Response(200, text=HOME_SEARCH_HTML),
            ("GET", "/search"): httpx.Response(200, text=SEARCH_DIRECT_HTML),
            ("GET", "/files/paper.pdf"): httpx.Response(
                200,
                content=b"%PDF-1.4\n%%EOF\n",
                headers={"content-type": "application/pdf"},
            ),
        }
    )

    def client_factory(**kwargs):
        return httpx.Client(transport=transport, base_url="https://spis.example", follow_redirects=True)

    with Session(session_factory) as session:
        settings = SpisSettingsService.get_settings(session)
        settings.account = "user"
        settings.password = "pass"
        settings.enabled = False
        session.add(settings)
        session.commit()

        paper = Paper(
            source="crossref",
            title="Manual Force Paper",
            local_pdf_path="",
            doi="10.1/manual-force",
            source_pdf_status="metadata_only",
            spis_status="available_for_rescue",
        )
        session.add(paper)
        session.commit()
        session.refresh(paper)

        service = SpisFallbackService(
            client_factory=client_factory,
            storage_service=__import__("app.services.storage", fromlist=["StorageService"]).StorageService(
                root=str(tmp_path / "storage")
            ),
            pipeline_factory=lambda: type("P", (), {
                "parse_paper": lambda self, s, p: p,
                "summarize_paper": lambda self, s, p, model=None: p,
            })(),
            base_url="https://spis.example/",
        )

        blocked = service.attempt_for_paper(session, paper, run_pipeline_on_success=False, force=False)
        session.refresh(paper)
        assert blocked.status == "available_for_rescue"
        assert paper.local_pdf_path == ""

        result = service.attempt_for_paper(session, paper, run_pipeline_on_success=False, force=True)
        session.refresh(paper)

    assert result.status == SPIS_RECOVERED
    assert paper.local_pdf_path
    assert paper.spis_status == SPIS_RECOVERED
