"""Application configuration with support for both source and desktop/packaged mode.

Source mode (default): paths are relative to the project root, Vite dev server
serves the frontend on :3000.

Desktop/packaged mode (desktop_mode=True or running as PyInstaller bundle):
paths resolve to platform-specific directories (e.g. %APPDATA%/paper-reader/),
and FastAPI serves the frontend static files.
"""

import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _resolve_env_file() -> Path:
    """Resolve .env file location based on runtime environment.

    Source mode:  project_root/.env
    Packaged mode (PyInstaller): exe_dir/.env or %APPDATA%/paper-reader/.env
    """
    if getattr(sys, "frozen", False):
        # PyInstaller packaged: look next to the executable first
        exe_dir = Path(sys.executable).parent
        env_in_exe_dir = exe_dir / ".env"
        if env_in_exe_dir.exists():
            return env_in_exe_dir
        # Fallback to APPDATA
        appdata = Path.home() / "AppData" / "Roaming" / "paper-reader"
        return appdata / ".env"
    # Source mode: project root (two levels up from this file)
    return Path(__file__).resolve().parents[2] / ".env"


def _resolve_data_dir() -> Path:
    """Resolve data directory for desktop/packaged mode.

    Returns %APPDATA%/paper-reader/data on Windows in packaged mode.
    Returns ./data/ (cwd-relative) in source mode.
    """
    if getattr(sys, "frozen", False):
        # PyInstaller packaged: use APPDATA
        appdata = Path.home() / "AppData" / "Roaming" / "paper-reader"
        data_dir = appdata / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir
    # Source mode: current working directory relative
    return Path("./data").resolve()


ENV_FILE = _resolve_env_file()


class Settings(BaseSettings):
    app_name: str = "paper-reader-backend"

    # Database URL — empty string means "use mode-appropriate default"
    # Source mode default: sqlite:///./data/paper_reader.db
    # Desktop mode default: sqlite:///%APPDATA%/paper-reader/data/paper_reader.db
    database_url: str = ""

    # Storage root — empty string means "use mode-appropriate default"
    # Source mode default: ./data/storage
    # Desktop mode default: %APPDATA%/paper-reader/data/storage
    storage_root: str = ""

    server_base_url: str = "http://localhost:8000"
    mineru_api_base: str = "https://mineru.net"
    mineru_api_token: str = ""
    deepseek_api_base: str = "https://api.deepseek.com"
    deepseek_api_key: str = ""

    # CORS origins — comma-separated
    # In desktop mode with same-origin serving, CORS is unnecessary
    cors_origins: str = "http://localhost:3000"

    jwt_secret: str = "paper-reader-secret-change-me"
    app_password: str = ""
    app_username: str = "admin"
    embedding_model_path: str = "BAAI/bge-m3"

    # Proxy settings (fallback when DB settings not available)
    http_proxy: str | None = None
    https_proxy: str | None = None

    # Desktop / production mode settings
    desktop_mode: bool = False
    static_dir: str = ""  # Empty = don't serve static files (dev mode)

    # AI thinking mode: "none", "low", "medium", "high" (default for system calls)
    deepseek_thinking: str = "high"

    @property
    def effective_database_url(self) -> str:
        """Resolve the effective database URL.

        Priority: env var DATABASE_URL > .env file > mode-appropriate default.
        """
        if self.database_url:
            return self.database_url
        if self.desktop_mode or getattr(sys, "frozen", False):
            data_dir = _resolve_data_dir()
            return f"sqlite:///{data_dir / 'paper_reader.db'}"
        return "sqlite:///./data/paper_reader.db"

    @property
    def effective_storage_root(self) -> str:
        """Resolve the effective storage root path.

        Priority: env var STORAGE_ROOT > .env file > mode-appropriate default.
        """
        if self.storage_root:
            return self.storage_root
        if self.desktop_mode or getattr(sys, "frozen", False):
            data_dir = _resolve_data_dir()
            return str(data_dir / "storage")
        return "./data/storage"

    @property
    def effective_cors_origins(self) -> str:
        """Resolve effective CORS origins.

        In desktop mode with same-origin serving, CORS is unnecessary.
        If cors_origins is still the dev default, switch to same-origin.
        """
        if self.desktop_mode and self.cors_origins == "http://localhost:3000":
            # Desktop mode default: same-origin, no CORS needed
            return "http://localhost:8000"
        return self.cors_origins

    @property
    def is_desktop_or_packaged(self) -> bool:
        """Check if running in desktop or packaged mode."""
        return self.desktop_mode or getattr(sys, "frozen", False)

    model_config = SettingsConfigDict(env_file=str(ENV_FILE), extra="ignore")


settings = Settings()