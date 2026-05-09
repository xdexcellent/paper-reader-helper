import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes.health import router as health_router
from app.api.routes.papers import router as papers_router
from app.api.routes.paper_blocks import router as paper_blocks_router
from app.api.routes.chat import router as chat_router
from app.api.routes.auth import router as auth_router
from app.api.routes.stats import router as stats_router
from app.api.routes.briefing import router as briefing_router
from app.api.routes.recommendations import router as recommendations_router
from app.api.routes.tasks import router as tasks_router
from app.api.routes.automation import router as automation_router
from app.api.routes.subscriptions import router as subscriptions_router
from app.api.routes.agent import router as agent_router
from app.api.routes.categories import router as categories_router
from app.api.routes.zotero import router as zotero_router
from app.core.config import settings
from app.core.db import init_db
from app.core.auth import get_current_user
from app.services.automation_scheduler import AutomationScheduler

# Import models so SQLModel creates their tables
from app.models.paper import Paper  # noqa: F401
from app.models.paper_content import PaperContent  # noqa: F401
from app.models.paper_summary import PaperSummary  # noqa: F401
from app.models.chat_session import ChatSession  # noqa: F401
from app.models.chat_message import ChatMessageRecord  # noqa: F401
from app.models.automation_settings import AutomationSettings  # noqa: F401
from app.models.daily_run import DailyRun  # noqa: F401
from app.models.ingestion_item import IngestionItem  # noqa: F401
from app.models.daily_briefing import (  # noqa: F401
    DailyBriefing,
    DailyBriefingPaperItem,
    DailyBriefingProjectItem,
)
from app.models.subscription import Subscription  # noqa: F401
from app.models.paper_embedding import PaperEmbedding  # noqa: F401
from app.models.paper_block import PaperBlock  # noqa: F401
from app.models.paper_block_translation import PaperBlockTranslation  # noqa: F401
from app.models.category import Category  # noqa: F401
from app.models.category_alias import CategoryAlias  # noqa: F401
from app.models.agent_run import AgentRun  # noqa: F401
from app.models.agent_tool_event import AgentToolEvent  # noqa: F401
from app.models.agent_action import AgentAction  # noqa: F401
from app.models.zotero_import_run import ZoteroImportRun  # noqa: F401
from app.models.zotero_import_candidate import ZoteroImportCandidate  # noqa: F401

logger = logging.getLogger(__name__)

def _path_matches_api_route(app: FastAPI, path: str, method: str) -> bool:
    """Check if a request path+method matches any registered API route.

    Uses FastAPI's own route matching to determine whether a path belongs to
    the API layer. This is more robust than maintaining a prefix list because
    it automatically adapts when routes are added or changed.

    Only matches against APIRoute entries (not static-file Mounts, etc.).
    """
    from starlette.routing import Match

    for route in app.routes:
        # Skip non-APIRoute entries (Mounts for static files, etc.)
        if not hasattr(route, "methods"):
            continue
        match, _ = route.matches({"type": "http", "path": path, "method": method})
        if match != Match.NONE:
            return True
    return False


class SPAFallbackMiddleware(BaseHTTPMiddleware):
    """Serve frontend static files and fallback to index.html for SPA routes.

    Only active when settings.static_dir is non-empty and the directory exists.
    In dev mode (static_dir empty), this middleware does nothing — all requests
    pass through to FastAPI routes normally.

    How it works:
    - Requests are first processed by FastAPI routes and mounted static files.
    - If a request results in a 404 AND the path did NOT match any API route,
      the middleware serves index.html for SPA client-side routing.
    - API routes are never intercepted — their 404s are real API 404s.
    - Paths that do match an API route (even if the handler returned 404) are
      passed through so the client receives the proper error response.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method.upper()

        # Let all requests fall through to normal handling first
        response = await call_next(request)

        # If the response is not a 404, return it as-is
        if response.status_code != 404:
            return response

        # Only handle 404s if static_dir is configured and exists
        # Read from the config module (not a cached reference) so tests can override
        from app.core import config as _cfg
        static_dir = _cfg.settings.static_dir
        if not static_dir:
            return response

        static_path = Path(static_dir)
        if not static_path.is_dir():
            return response

        # If the path matched an API route, the 404 is a genuine API error — pass through
        if _path_matches_api_route(request.app, path, method):
            return response

        # Static file mounts (/files, /assets) — if they 404, the file doesn't exist
        if path.startswith("/files/") or path.startswith("/assets/"):
            return response

        # Serve index.html for SPA client-side routing
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

# ─── Middleware ─────────────────────────────────────────────────────────────

# SPA fallback is added first (executed innermost) so CORS headers are applied
# to SPA responses as well. When SPA fallback returns index.html, CORS middleware
# (added second, executed outermost) adds the appropriate headers to the response.
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

# ─── API routes (registered first, take priority over static mounts) ────────

app.include_router(health_router)
app.include_router(auth_router)

# Protect all API routes with get_current_user dependency
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

# ─── Static file mounts (after API routes so they don't shadow them) ──────

# Storage files (PDFs, etc.)
storage_path = Path(settings.effective_storage_root)
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(storage_path)), name="storage_files")

# Frontend static files in production/desktop mode
# Mount assets for direct access, and SPA middleware handles fallback to index.html
if settings.static_dir and Path(settings.static_dir).is_dir():
    static_dir_path = Path(settings.static_dir)
    # Mount assets subdirectory for fast static file serving
    assets_dir = static_dir_path / "assets"
    if assets_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=str(assets_dir)),
            name="frontend_assets",
        )
    logger.info("Desktop/production mode: serving frontend from %s", settings.static_dir)