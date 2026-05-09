# Desktop Packaging Spec

> Cross-layer spec for packaging paper-reader-helper as a Tauri desktop application.

---

## 1. Scope / Trigger

This spec covers all changes needed to transform the web app into a standalone desktop application via Tauri v2 + PyInstaller. The trigger is any modification to support production-mode static file serving, sidecar process management, or packaged-environment path resolution.

---

## 2. Signatures

### 2.1 Backend Config Changes

```python
# backend/app/core/config.py

# Environment detection
DESKTOP_MODE: bool = False  # Set to True in desktop packaged environment

# Path resolution (must work both in source and packaged modes)
def resolve_env_file() -> Path:
    """Resolve .env file location.
    
    Source mode: Path(__file__).resolve().parents[2] / ".env"
    Packaged mode (PyInstaller): exe_dir / ".env" or APPDATA / "paper-reader" / ".env"
    Uses sys._MEIPASS detection to distinguish modes.
    """

def resolve_data_dir() -> Path:
    """Resolve data directory for SQLite DB and storage.
    
    Source mode: ./data/  (cwd-relative)
    Packaged mode: %APPDATA%/paper-reader/ on Windows
    """

# Updated defaults
class Settings(BaseSettings):
    static_dir: str = ""  # Empty = don't serve static files; set to path in desktop mode
    desktop_mode: bool = False  # True when running as packaged desktop app
    # database_url and storage_root will resolve via resolve_data_dir() when desktop_mode=True
```

### 2.2 SPA Fallback Middleware

```python
# backend/app/main.py — new middleware

class SPAFallbackMiddleware:
    """Serve frontend static files and fallback to index.html for SPA routes.
    
    Rules:
    - /api/*, /docs, /openapi.json, /files/* → pass through to FastAPI routes
    - /assets/*, /vite.svg, /favicon.ico, *.js, *.css → serve from static_dir
    - Everything else → serve index.html (SPA client-side routing)
    
    Only active when settings.static_dir is non-empty.
    """
```

### 2.3 Frontend API Base

```typescript
// frontend/src/lib/api.ts

// Production (desktop/same-origin): VITE_API_BASE is empty string → relative fetch
// Development: VITE_API_BASE defaults to 'http://localhost:8000' → cross-origin fetch
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
// In .env.production: VITE_API_BASE='' (empty, same-origin)
```

### 2.4 Tauri Configuration

```json
// src-tauri/tauri.conf.json (key sections)

{
  "app": {
    "windows": [{
      "title": "Paper Reader",
      "width": 1280,
      "height": 900,
      "url": "http://localhost:8000"
    }]
  },
  "bundle": {
    "externalBin": ["binaries/backend"],
    "resources": ["../frontend/dist/**"]
  },
  "plugins": {
    "shell": {
      "scope": [{
        "name": "binaries/backend",
        "sidecar": true,
        "args": true
      }]
    }
  }
}
```

### 2.5 PyInstaller Spec Key Sections

```python
# backend/paper-reader-backend.spec (key sections)

a = Analysis(
    # ... 
    excludes=[
        'sentence_transformers',
        'torch', 'torchvision', 'torchaudio',
        'tensorflow', 'keras',
        'numpy.testing', 'unittest',
    ],
    # ...
)
```

---

## 3. Contracts

### 3.1 Environment Variables

| Variable | Source Mode | Packaged Mode | Notes |
|----------|-------------|---------------|-------|
| `DESKTOP_MODE` | unset / `false` | `true` | Controls path resolution and static file serving |
| `STATIC_DIR` | unset (dev server serves frontend) | path to `frontend/dist` | Where to serve frontend from |
| `DATABASE_URL` | `sqlite:///./data/paper_reader.db` | `sqlite:///%APPDATA%/paper-reader/data/paper_reader.db` | Absolute path in packaged mode |
| `STORAGE_ROOT` | `./data/storage` | `%APPDATA%/paper-reader/data/storage` | Absolute path in packaged mode |
| `VITE_API_BASE` | `http://localhost:8000` | `` (empty, same-origin) | Build-time env for frontend |
| `CORS_ORIGINS` | `http://localhost:3000` | `http://localhost:8000` (or empty) | Same-origin in packaged mode |

### 3.2 Path Resolution Priority (Desktop Mode)

```
1. Environment variable (DATABASE_URL, STORAGE_ROOT, etc.)
2. .env file next to the executable (or in %APPDATA%/paper-reader/)
3. Default: %APPDATA%/paper-reader/data/ on Windows
```

### 3.3 SPA Fallback Rules

**Implementation uses `_path_matches_api_route()` — NOT a static prefix list.**

The SPA fallback middleware intercepts 404 responses and serves `index.html` for non-API routes. API route detection uses FastAPI's own route matching (`route.match()`), not a hardcoded prefix list. This ensures:

1. API 404s (e.g., `/papers/99999`) return JSON errors, not `index.html`
2. New API routes are automatically covered — no prefix list to maintain
3. Static file mount 404s (`/files/`, `/assets/`) pass through as real 404s

| Request Path | Action | Condition |
|-------------|--------|-----------|
| Any path matching a registered API route | Pass through (even if handler returns 404) | Always |
| `/files/*` | Serve from `storage_root` | Always |
| `/assets/*` | Serve from `static_dir/assets/` | `static_dir` set |
| Any other 404 path | Serve `index.html` from `static_dir` | `static_dir` set |

### 3.4 Health Check Contract (unchanged)

```
GET /health → 200 {"status": "ok"}
```

Used by Tauri frontend to poll backend readiness before showing the app.

---

## 4. Validation & Error Matrix

| Condition | Error | Recovery |
|-----------|-------|----------|
| `static_dir` set but directory not found | Log warning, serve API-only (no frontend) | Admin should rebuild frontend |
| `static_dir` set but `index.html` missing | Log warning, 404 for SPA routes | Admin should rebuild frontend |
| `database_url` path parent doesn't exist | Auto-create directory (current behavior) | Same as source mode |
| `storage_root` doesn't exist | Auto-create directory | Same as source mode |
| PyInstaller exe can't find `.env` | Use defaults, log info message | App still works with defaults |
| sentence-transformers not installed | Return graceful error from embedding endpoint | User installs via settings |
| Sidecar fails to start | Tauri shows error dialog | User checks logs |

---

## 5. Good / Base / Bad Cases

### 5.1 Path Resolution

**Good**: `DESKTOP_MODE=true`, `DATABASE_URL` resolved to `%APPDATA%/paper-reader/data/paper_reader.db`, `.env` loaded from same directory.

**Base**: No `DESKTOP_MODE`, paths are cwd-relative (current behavior, unchanged).

**Bad**: `DESKTOP_MODE=true` but no `%APPDATA%/paper-reader/` directory exists → auto-create on startup.

### 5.2 SPA Fallback

**Good**: Request to `/briefing` → `index.html` served → React Router handles client-side routing.

**Base**: Development mode, Vite dev server handles SPA fallback, no middleware needed.

**Bad**: `static_dir` points to wrong directory → 404 for all frontend routes, API still works.

---

## 6. Tests Required

### 6.1 Backend Tests

- **SPA fallback middleware**: Test that `/api/papers` passes through, `/briefing` returns `index.html`, `/assets/main.js` returns the static file.
- **Config path resolution**: Test `DESKTOP_MODE=false` uses cwd paths, `DESKTOP_MODE=true` uses `%APPDATA%` paths.
- **Desktop mode env loading**: Test that `.env` can be loaded from executable directory.

### 6.2 Frontend Tests

- **API_BASE resolution**: Test that `VITE_API_BASE=''` results in same-origin fetch, `VITE_API_BASE='http://localhost:8000'` results in cross-origin fetch.

### 6.3 Integration Tests

- **Production build serving**: Test that `npm run build` + `STATIC_DIR=../frontend/dist uvicorn app.main:app` serves the app on `:8000` with SPA fallback.
- **Sidecar lifecycle**: Test that Tauri window close terminates backend process.

---

## 7. Wrong vs Correct

### 7.1 Path Resolution

#### Wrong — Assuming source directory structure in packaged mode

```python
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
# In PyInstaller bundle, __file__ is inside _MEIPASS, not the project root
```

#### Correct — Detect packaged mode and resolve accordingly

```python
import sys

def resolve_env_file() -> Path:
    if getattr(sys, 'frozen', False):
        # PyInstaller packaged: exe directory
        return Path(sys.executable).parent / ".env"
    # Source mode: project root
    return Path(__file__).resolve().parents[2] / ".env"
```

### 7.2 CORS in Production

#### Wrong — Keeping dev CORS in production

```python
# cors_origins = "http://localhost:3000" hardcoded
# In desktop mode, frontend is served from :8000, same origin
# CORS is unnecessary and the origin doesn't match
```

#### Correct — Adapt CORS per environment

```python
# In desktop mode, same-origin, CORS not needed
# Keep cors_origins configurable, default to "" in desktop mode
cors_origins: str = "http://localhost:3000" if not desktop_mode else ""
```

### 7.3 API Base URL

#### Wrong — Hardcoded localhost in production

```typescript
const API_BASE = 'http://localhost:8000'
// In desktop mode, frontend is served from same origin
// This causes unnecessary cross-origin requests
```

#### Correct — Environment-aware API base

```typescript
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
// In .env.production: VITE_API_BASE=''
// Empty string = same-origin fetch (relative URLs)
```

### 7.4 SPA Fallback — Static Prefix List vs Route Matching

#### Wrong — Using a hardcoded list of API path prefixes

```python
_API_PREFIXES = ["/api/", "/papers", "/chat", "/stats", "/health", "/auth", "/files/"]
# Problem: /papers/99999 returns 404, middleware intercepts → serves index.html
# instead of the JSON error response. Client gets HTML instead of a proper API error.
# Also fragile: every new route must be manually added to the list.
```

#### Correct — Using FastAPI route matching to detect API routes

```python
def _path_matches_api_route(app: FastAPI, path: str, method: str) -> bool:
    from starlette.routing import Match
    for route in app.routes:
        if not hasattr(route, "methods"):
            continue  # Skip static-file Mounts
        match, _ = route.match({"type": "http", "path": path, "method": method})
        if match != Match.NONE:
            return True
    return False
```

This automatically covers all registered API routes, including ones that return 404
(e.g., `/papers/99999` — a valid route pattern, but the resource doesn't exist).

### Design Decision: Config Property Pattern for Mode-Dependent Paths

**Context**: In desktop mode, `database_url`, `storage_root`, and `cors_origins` need different defaults than in source mode. Simply changing the Settings defaults would break existing behavior.

**Options considered**:
1. Two separate Settings classes (DesktopSettings, DevSettings) — too much duplication
2. `@property` methods on Settings that compute effective values — clean, minimal change
3. Post-init validation that mutates fields — confusing, hard to test

**Decision**: Use `@property` methods (`effective_database_url`, `effective_storage_root`, `effective_cors_origins`) that check `desktop_mode` and `sys.frozen` to return mode-appropriate values. The raw `database_url`/`storage_root` fields default to empty strings, meaning "use mode-appropriate default".

**Example**:
```python
class Settings(BaseSettings):
    database_url: str = ""  # Empty = use mode-appropriate default
    desktop_mode: bool = False

    @property
    def effective_database_url(self) -> str:
        if self.database_url:
            return self.database_url  # Explicit override
        if self.desktop_mode or getattr(sys, "frozen", False):
            return f"sqlite:///{_resolve_data_dir() / 'paper_reader.db'}"
        return "sqlite:///./data/paper_reader.db"  # Source mode default
```

**Gotcha**: All code that reads `settings.database_url` or `settings.storage_root` must use `settings.effective_database_url` and `settings.effective_storage_root` instead. Direct field access skips mode resolution.