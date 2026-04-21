from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes.health import router as health_router
from app.api.routes.papers import router as papers_router
from app.api.routes.chat import router as chat_router
from app.api.routes.auth import router as auth_router
from app.api.routes.stats import router as stats_router
from app.api.routes.briefing import router as briefing_router
from app.api.routes.recommendations import router as recommendations_router
from app.api.routes.tasks import router as tasks_router
from app.api.routes.automation import router as automation_router
from app.api.routes.subscriptions import router as subscriptions_router
from app.api.routes.categories import router as categories_router
from app.core.config import settings
from app.core.db import init_db
from app.core.auth import get_current_user
from app.services.automation_scheduler import AutomationScheduler
from fastapi import Depends

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
from app.models.category import Category  # noqa: F401
from app.models.category_alias import CategoryAlias  # noqa: F401


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(auth_router)

# Protect all API routes with get_current_user dependency
protected_dependencies = [Depends(get_current_user)]
app.include_router(papers_router, dependencies=protected_dependencies)
app.include_router(chat_router, dependencies=protected_dependencies)
app.include_router(stats_router, dependencies=protected_dependencies)
app.include_router(briefing_router, dependencies=protected_dependencies)
app.include_router(recommendations_router, dependencies=protected_dependencies)
app.include_router(tasks_router, dependencies=protected_dependencies)
app.include_router(automation_router, dependencies=protected_dependencies)
app.include_router(subscriptions_router, dependencies=protected_dependencies)
app.include_router(categories_router, dependencies=protected_dependencies)

# Mount storage directory as static files so MinerU API can download PDFs
storage_path = Path(settings.storage_root)
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(storage_path)), name="storage_files")
