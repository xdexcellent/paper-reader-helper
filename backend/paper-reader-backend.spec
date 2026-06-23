# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec file for paper-reader-backend.

Builds the FastAPI backend into a standalone executable for the
Paper Reader desktop application (Tauri sidecar).

Usage:
    # From project root:
    python backend/build_exe.py

    # Or directly:
    cd backend && pyinstaller paper-reader-backend.spec

Key decisions:
- onedir mode (single directory bundle) for easier debugging and
  sidecar compatibility with Tauri's externalBin mechanism.
- console mode enabled so users can see logs during development;
  switch to noconsole for production releases.
- Heavy ML deps (sentence_transformers, torch, tensorflow) are
  excluded to keep bundle size ~200MB. Embedding functionality
  degrades gracefully via EMBEDDING_AVAILABLE flag.
"""

import sys
from pathlib import Path

# ─── Project paths ──────────────────────────────────────────────────────────
# spec file lives in backend/, project root is one level up
PROJECT_ROOT = Path(SPECPATH).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

# ─── Analysis ───────────────────────────────────────────────────────────────
a = Analysis(
    # Entry point: uvicorn with our FastAPI app
    [str(BACKEND_DIR / "app" / "main.py")],
    pathex=[str(BACKEND_DIR)],
    binaries=[],
    datas=[
        # Pydantic JSON schema files
        ("pydantic", "pydantic"),
        # Include .env.example as a reference (users can copy to .env)
        (str(BACKEND_DIR / ".env.example"), "."),
    ],
    hiddenimports=[
        # FastAPI and dependencies
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "fastapi",
        "starlette",
        "starlette.routing",
        "starlette.middleware",
        "starlette.middleware.cors",
        "starlette.staticfiles",
        "starlette.responses",
        # SQLModel / SQLAlchemy
        "sqlmodel",
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.sql.default_comparator",
        # pydantic-settings
        "pydantic_settings",
        # HTTP client
        "httpx",
        "httpx._transports",
        "httpx._transports.default",
        # JWT
        "jwt",
        "jwt.algorithms",
        # File uploads
        "python_multipart",
        # App modules — all subpackages must be listed for PyInstaller
        "app",
        "app.core",
        "app.core.config",
        "app.core.db",
        "app.core.auth",
        "app.api",
        "app.api.routes",
        "app.api.routes.health",
        "app.api.routes.auth",
        "app.api.routes.papers",
        "app.api.routes.paper_blocks",
        "app.api.routes.chat",
        "app.api.routes.stats",
        "app.api.routes.briefing",
        "app.api.routes.recommendations",
        "app.api.routes.tasks",
        "app.api.routes.automation",
        "app.api.routes.subscriptions",
        "app.api.routes.agent",
        "app.api.routes.categories",
        "app.api.routes.zotero",
        "app.api.routes.settings",
        "app.models",
        "app.models.paper",
        "app.models.paper_content",
        "app.models.paper_summary",
        "app.models.paper_embedding",
        "app.models.paper_block",
        "app.models.paper_block_translation",
        "app.models.chat_session",
        "app.models.chat_message",
        "app.models.automation_settings",
        "app.models.ai_provider_settings",
        "app.models.daily_run",
        "app.models.ingestion_item",
        "app.models.daily_briefing",
        "app.models.subscription",
        "app.models.category",
        "app.models.category_alias",
        "app.models.agent_run",
        "app.models.agent_tool_event",
        "app.models.agent_action",
        "app.models.zotero_import_run",
        "app.models.zotero_import_candidate",
        "app.schemas",
        "app.schemas.paper",
        "app.schemas.settings",
        "app.services",
        "app.services.embedding_service",
        "app.services.pipeline",
        "app.services.ai_provider_settings_service",
        "app.services.automation_scheduler",
        "app.services.category_service",
        "app.services.http_client_factory",
        "app.services.agent_tool_registry",
        "app.services.task_queue",
        # Schedulers
        "apscheduler",
        "apscheduler.schedulers",
        "apscheduler.schedulers.background",
        "apscheduler.triggers",
        "apscheduler.triggers.interval",
        # Async email/parser deps
        "email_validator",
        # PDF processing
        "pypdf",
        # Encodings and i18n
        "encodings",
        "encodings.utf_8",
        "encodings.idna",
    ],
    excludes=[
        # Heavy ML deps — excluded to keep bundle under ~200MB
        # sentence-transformers pulls in torch (~1.5GB) and huggingface-hub
        "sentence_transformers",
        "torch",
        "torchvision",
        "torchaudio",
        "tensorflow",
        "keras",
        # Unused heavy modules
        "numpy.testing",
        "unittest",
        "pytest",
        "_pytest",
        "test",
        "tests",
        "setuptools",
        "pip",
        "wheel",
    ],
    noarchive=False,
    optimize=0,
)

# ─── PYZ (compressed Python modules) ────────────────────────────────────────
pyz = PYZ(a.pure, logger=None)

# ─── EXE ────────────────────────────────────────────────────────────────────
exe = EXE(
    pyz,
    a.scripts,
    [],
    # onedir mode: creates paper-reader-backend/ directory with exe + deps
    # This is preferred for Tauri sidecar because:
    # 1. Faster startup (no extraction to temp dir)
    # 2. Easier debugging (can inspect bundled files)
    # 3. Tauri externalBin expects a directory or renamed exe
    name="paper-reader-backend",
    debug=False,
    bootloader_ignore_signatures=False,
    # Console mode: show terminal window for debugging
    # For production, set to False (noconsole/windowed mode) to hide the terminal
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # Add an .ico file here for a custom icon
)

# ─── COLLECT (onedir bundle) ────────────────────────────────────────────────
coll = COLL(
    exe,
    a.binaries,
    a.datas,
    [],
    name="paper-reader-backend",
)
