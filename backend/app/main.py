import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes.agent import router as agent_router
from app.api.routes.auth import router as auth_router
from app.api.routes.automation import router as automation_router
from app.api.routes.briefing import router as briefing_router
from app.api.routes.categories import router as categories_router
from app.api.routes.chat import router as chat_router
from app.api.routes.health import router as health_router
from app.api.routes.paper_blocks import router as paper_blocks_router
from app.api.routes.papers import router as papers_router
from app.api.routes.recommendations import router as recommendations_router
from app.api.routes.settings import router as settings_router
from app.api.routes.stats import router as stats_router
from app.api.routes.subscriptions import router as subscriptions_router
from app.api.routes.tasks import router as tasks_router
from app.api.routes.zotero import router as zotero_router
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.db import init_db
from app.services.automation_scheduler import AutomationScheduler

from app.models.agent_action import AgentAction  # noqa: F401
from app.models.agent_run import AgentRun  # noqa: F401
from app.models.agent_tool_event import AgentToolEvent  # noqa: F401
from app.models.ai_provider_settings import AiProviderSettings  # noqa: F401
from app.models.automation_settings import AutomationSettings  # noqa: F401
from app.models.category import Category  # noqa: F401
from app.models.category_alias import CategoryAlias  # noqa: F401
from app.models.chat_message import ChatMessageRecord  # noqa: F401
from app.models.chat_session import ChatSession  # noqa: F401
from app.models.daily_briefing import (  # noqa: F401
    DailyBriefing,
    DailyBriefingPaperItem,
    DailyBriefingProjectItem,
)
from app.models.daily_run import DailyRun  # noqa: F401
from app.models.easyscholar_settings import EasyScholarSettings  # noqa: F401
from app.models.ingestion_item import IngestionItem  # noqa: F401
from app.models.paper import Paper  # noqa: F401
from app.models.paper_block import PaperBlock  # noqa: F401
from app.models.paper_block_translation import PaperBlockTranslation  # noqa: F401
from app.models.paper_content import PaperContent  # noqa: F401
from app.models.paper_embedding import PaperEmbedding  # noqa: F401
from app.models.paper_summary import PaperSummary  # noqa: F401
from app.models.subscription import Subscription  # noqa: F401
from app.models.venue_rank import VenueRank  # noqa: F401
from app.models.zotero_import_candidate import ZoteroImportCandidate  # noqa: F401
from app.models.zotero_import_run import ZoteroImportRun  # noqa: F401
from app.models.user import User  # noqa: F401

logger = logging.getLogger(__name__)


def _path_matches_api_route(app: FastAPI, path: str, method: str) -> bool:
    from starlette.routing import Match

    for route in app.routes:
        if not hasattr(route, "methods"):
            continue
        match, _ = route.matches({"type": "http", "path": path, "method": method})
        if match != Match.NONE:
            return True
    return False


class SPAFallbackMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method.upper()
        response = await call_next(request)

        if response.status_code != 404:
            return response

        from app.core import config as _cfg

        static_dir = _cfg.settings.static_dir
        if not static_dir:
            return response

        static_path = Path(static_dir)
        if not static_path.is_dir():
            return response

        if _path_matches_api_route(request.app, path, method):
            return response

        if path.startswith("/files/") or path.startswith("/assets/"):
            return response

        index_html = static_path / "index.html"
        if index_html.is_file():
            return Response(
                content=index_html.read_bytes(),
                status_code=200,
                media_type="text/html",
            )

        return response


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    scheduler = AutomationScheduler()
    scheduler.load_settings()
    scheduler.start()
    try:
        yield
    finally:
        scheduler.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

if settings.static_dir:
    app.add_middleware(SPAFallbackMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.effective_cors_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)

protected_dependencies = [Depends(get_current_user)]
app.include_router(papers_router, dependencies=protected_dependencies)
app.include_router(paper_blocks_router, dependencies=protected_dependencies)
app.include_router(chat_router, dependencies=protected_dependencies)
app.include_router(stats_router, dependencies=protected_dependencies)
app.include_router(briefing_router, dependencies=protected_dependencies)
app.include_router(recommendations_router, dependencies=protected_dependencies)
app.include_router(tasks_router, dependencies=protected_dependencies)
app.include_router(automation_router, dependencies=protected_dependencies)
app.include_router(subscriptions_router, dependencies=protected_dependencies)
app.include_router(agent_router, dependencies=protected_dependencies)
app.include_router(categories_router, dependencies=protected_dependencies)
app.include_router(zotero_router, dependencies=protected_dependencies)
app.include_router(settings_router, dependencies=protected_dependencies)

storage_path = Path(settings.effective_storage_root)
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(storage_path)), name="storage_files")

if settings.static_dir and Path(settings.static_dir).is_dir():
    static_dir_path = Path(settings.static_dir)
    assets_dir = static_dir_path / "assets"
    if assets_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=str(assets_dir)),
            name="frontend_assets",
        )
    logger.info("Desktop/production mode: serving frontend from %s", settings.static_dir)
