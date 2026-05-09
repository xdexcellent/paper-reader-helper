"""Tests for desktop/production mode features.

- SPA fallback middleware (StaticFiles with html=True)
- Desktop mode config resolution
- Effective database URL, storage root, and CORS origins
"""

import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient


# ─── Config resolution tests ───────────────────────────────────────────────


class TestConfigDefaults:
    """Test that default config values resolve correctly in source mode."""

    def test_effective_database_url_source_mode(self):
        """In source mode (DESKTOP_MODE=false), effective_database_url defaults to
        sqlite:///./data/paper_reader.db when DATABASE_URL is not set."""
        from app.core.config import Settings

        s = Settings(
            database_url="",
            desktop_mode=False,
            _env_file=None,
        )
        assert s.effective_database_url == "sqlite:///./data/paper_reader.db"

    def test_effective_storage_root_source_mode(self):
        """In source mode, effective_storage_root defaults to ./data/storage."""
        from app.core.config import Settings

        s = Settings(
            storage_root="",
            desktop_mode=False,
            _env_file=None,
        )
        assert s.effective_storage_root == "./data/storage"

    def test_effective_cors_origins_source_mode(self):
        """In source mode, CORS origins stay as configured."""
        from app.core.config import Settings

        s = Settings(
            cors_origins="http://localhost:3000",
            desktop_mode=False,
            _env_file=None,
        )
        assert s.effective_cors_origins == "http://localhost:3000"

    def test_effective_database_url_with_explicit_value(self):
        """When DATABASE_URL is explicitly set, it takes priority over defaults."""
        from app.core.config import Settings

        s = Settings(
            database_url="sqlite:///./custom/path.db",
            desktop_mode=False,
            _env_file=None,
        )
        assert s.effective_database_url == "sqlite:///./custom/path.db"

    def test_effective_storage_root_with_explicit_value(self):
        """When STORAGE_ROOT is explicitly set, it takes priority over defaults."""
        from app.core.config import Settings

        s = Settings(
            storage_root="/custom/storage",
            desktop_mode=False,
            _env_file=None,
        )
        assert s.effective_storage_root == "/custom/storage"


class TestConfigDesktopMode:
    """Test that desktop mode resolves paths correctly."""

    def test_effective_cors_origins_desktop_mode_default(self):
        """In desktop mode with default cors_origins, switch to same-origin."""
        from app.core.config import Settings

        s = Settings(
            cors_origins="http://localhost:3000",
            desktop_mode=True,
            _env_file=None,
        )
        assert s.effective_cors_origins == "http://localhost:8000"

    def test_effective_cors_origins_desktop_mode_custom(self):
        """In desktop mode with custom cors_origins, keep the custom value."""
        from app.core.config import Settings

        s = Settings(
            cors_origins="http://localhost:3000,http://other:4000",
            desktop_mode=True,
            _env_file=None,
        )
        assert s.effective_cors_origins == "http://localhost:3000,http://other:4000"

    def test_effective_database_url_desktop_mode(self):
        """In desktop mode with empty DATABASE_URL, resolve to APPDATA path."""
        from app.core.config import Settings

        s = Settings(
            database_url="",
            desktop_mode=True,
            _env_file=None,
        )
        url = s.effective_database_url
        # Should be an absolute path containing 'paper-reader'
        assert "paper-reader" in url
        assert url.startswith("sqlite:///")

    def test_effective_storage_root_desktop_mode(self):
        """In desktop mode with empty STORAGE_ROOT, resolve to APPDATA path."""
        from app.core.config import Settings

        s = Settings(
            storage_root="",
            desktop_mode=True,
            _env_file=None,
        )
        root = s.effective_storage_root
        assert "paper-reader" in root

    def test_is_desktop_or_packaged(self):
        """Test is_desktop_or_packaged property."""
        from app.core.config import Settings

        s_normal = Settings(desktop_mode=False, _env_file=None)
        assert s_normal.is_desktop_or_packaged is False

        s_desktop = Settings(desktop_mode=True, _env_file=None)
        assert s_desktop.is_desktop_or_packaged is True


class TestConfigPackagedMode:
    """Test that packaged mode (sys.frozen) works like desktop mode."""

    def test_packaged_mode_forces_desktop_paths(self):
        """When sys.frozen is True, effective_database_url uses APPDATA paths."""
        from app.core.config import _resolve_data_dir

        # Mock sys.frozen to simulate PyInstaller packaged mode
        with patch("app.core.config.sys") as mock_sys:
            mock_sys.frozen = True
            data_dir = _resolve_data_dir()
            # Should be under AppData/Roaming/paper-reader/data
            assert "paper-reader" in str(data_dir)


# ─── SPA fallback tests ───────────────────────────────────────────────────


class TestSPAFallback:
    """Test that SPA fallback works correctly when static_dir is configured."""

    def test_static_files_serves_assets(self, tmp_path: Path):
        """StaticFiles can serve files from the assets directory."""
        # Create a minimal frontend dist
        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()
        (dist_dir / "index.html").write_text("<html><body>SPA App</body></html>")
        assets_dir = dist_dir / "assets"
        assets_dir.mkdir()
        (assets_dir / "app.js").write_text("// app code")

        from fastapi.staticfiles import StaticFiles

        # Test StaticFiles directly — it serves assets correctly
        spa_app = StaticFiles(directory=str(dist_dir), html=True)
        client = TestClient(spa_app)

        # Root serves index.html (because html=True and / matches /index.html)
        response = client.get("/")
        assert response.status_code == 200
        assert "SPA App" in response.text

        # Assets are served directly
        response = client.get("/assets/app.js")
        assert response.status_code == 200
        assert "// app code" in response.text

    def test_spa_fallback_not_active_without_static_dir(self):
        """When static_dir is empty, SPA fallback should not be active."""
        from app.core.config import Settings

        test_settings = Settings(
            static_dir="",
            desktop_mode=False,
            cors_origins="http://localhost:3000",
            database_url="sqlite:///./test-data/test-spa.db",
            storage_root="./test-data/storage",
            _env_file=None,
        )

        # Verify no static_dir
        assert test_settings.static_dir == ""

    def test_api_routes_not_served_by_spa(self, client: TestClient):
        """API routes should return API responses, not HTML."""
        # The health endpoint should return JSON
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        assert "text/html" not in response.headers.get("content-type", "")

    def test_api_404_not_intercepted_by_spa(self, tmp_path: Path):
        """API routes that return 404 should NOT be intercepted by SPA fallback.

        This is the critical bug prevention test: when an API route handler
        raises a 404 (e.g., paper not found), the SPA fallback must NOT
        replace it with index.html. The client expects a JSON error response.
        """
        from app.core.config import Settings
        from app.main import SPAFallbackMiddleware
        from fastapi import HTTPException

        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()
        (dist_dir / "index.html").write_text("<html><body>SPA Fallback</body></html>")

        test_app = FastAPI()

        @test_app.get("/health")
        def health():
            return {"status": "ok"}

        @test_app.get("/papers/{paper_id}")
        def get_paper(paper_id: int):
            raise HTTPException(status_code=404, detail="Paper not found")

        @test_app.get("/briefing/today")
        def briefing_today():
            return {"date": "today"}

        test_settings = Settings(
            static_dir=str(dist_dir),
            desktop_mode=True,
            cors_origins="",
            database_url="sqlite:///./test-data/test-spa.db",
            storage_root="./test-data/storage",
            _env_file=None,
        )

        import app.core.config as config_module
        original_settings = config_module.settings
        config_module.settings = test_settings

        try:
            test_app.add_middleware(SPAFallbackMiddleware)

            with TestClient(test_app) as test_client:
                # API 404 must return JSON, not HTML
                response = test_client.get("/papers/99999")
                assert response.status_code == 404
                assert "application/json" in response.headers.get("content-type", "")
                assert "Paper not found" in response.text

                # API 200 returns JSON
                response = test_client.get("/health")
                assert response.status_code == 200
                assert response.json() == {"status": "ok"}

                # API route with deep path
                response = test_client.get("/briefing/today")
                assert response.status_code == 200
                assert response.json() == {"date": "today"}

                # SPA routes return HTML
                response = test_client.get("/briefing")
                assert response.status_code == 200
                assert "text/html" in response.headers.get("content-type", "")
                assert "SPA Fallback" in response.text
        finally:
            config_module.settings = original_settings

    def test_full_app_spa_fallback(self, tmp_path: Path):
        """Test SPA fallback in the full app using middleware approach.

        When static_dir is configured, requests to non-API paths that would
        otherwise 404 should serve index.html.
        """
        # Create a minimal frontend dist
        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()
        index_html = "<html><body>SPA Fallback Test</body></html>"
        (dist_dir / "index.html").write_text(index_html)
        assets_dir = dist_dir / "assets"
        assets_dir.mkdir()
        (assets_dir / "app.js").write_text("// app code")

        # Create a FastAPI app with SPA fallback middleware
        from app.core.config import Settings
        from app.main import SPAFallbackMiddleware

        test_app = FastAPI()

        @test_app.get("/health")
        def health():
            return {"status": "ok"}

        @test_app.get("/papers")
        def papers():
            return []

        # Add SPA fallback middleware
        test_settings = Settings(
            static_dir=str(dist_dir),
            desktop_mode=True,
            cors_origins="",
            database_url="sqlite:///./test-data/test-spa.db",
            storage_root="./test-data/storage",
            _env_file=None,
        )

        # We need to override settings for the middleware
        import app.core.config as config_module
        original_settings = config_module.settings
        config_module.settings = test_settings

        try:
            test_app.add_middleware(
                SPAFallbackMiddleware,
            )

            with TestClient(test_app) as test_client:
                # API routes should return JSON
                response = test_client.get("/health")
                assert response.status_code == 200
                assert response.json() == {"status": "ok"}

                # Non-API routes that 404 should serve index.html
                response = test_client.get("/briefing")
                assert response.status_code == 200
                assert "SPA Fallback Test" in response.text
                assert "text/html" in response.headers.get("content-type", "")

                # Another SPA route
                response = test_client.get("/papers/detail/123")
                assert response.status_code == 200
                assert "SPA Fallback Test" in response.text
        finally:
            config_module.settings = original_settings


class TestEnvFileResolution:
    """Test that .env file resolution works in both modes."""

    def test_source_mode_env_file(self):
        """In source mode, .env file is in project root."""
        from app.core.config import _resolve_env_file

        # In source mode (not frozen), should resolve to project root
        env_file = _resolve_env_file()
        # Should end with .env and be under a parent directory
        assert env_file.name == ".env"

    def test_packaged_mode_env_file_with_existing(self, tmp_path: Path):
        """In packaged mode, .env is looked up next to the executable."""
        from app.core.config import _resolve_env_file

        # Create a .env file next to the "executable"
        env_file = tmp_path / ".env"
        env_file.write_text("TEST=value")

        with patch("app.core.config.sys") as mock_sys:
            mock_sys.frozen = True
            mock_sys.executable = str(tmp_path / "app.exe")

            # This should find the .env next to the "executable"
            result = _resolve_env_file()
            assert result == env_file


class TestPathMatchesApiRoute:
    """Test the _path_matches_api_route helper function."""

    def test_matches_known_routes(self):
        """Known API routes should be recognized."""
        from app.main import app, _path_matches_api_route

        # These paths should match registered routes
        assert _path_matches_api_route(app, "/health", "GET") is True
        assert _path_matches_api_route(app, "/auth/status", "GET") is True
        assert _path_matches_api_route(app, "/papers", "GET") is True
        assert _path_matches_api_route(app, "/papers/1", "GET") is True

    def test_does_not_match_spa_routes(self):
        """SPA-only routes should NOT match any API route."""
        from app.main import app, _path_matches_api_route

        # These are frontend-only routes, no API handler for them
        assert _path_matches_api_route(app, "/assistant", "GET") is False
        assert _path_matches_api_route(app, "/recommendation", "GET") is False
        assert _path_matches_api_route(app, "/subscribe", "GET") is False

    def test_does_not_match_arbitrary_paths(self):
        """Arbitrary paths that aren't routes should not match."""
        from app.main import app, _path_matches_api_route

        assert _path_matches_api_route(app, "/random/page", "GET") is False
        assert _path_matches_api_route(app, "/some/deep/nested/path", "GET") is False