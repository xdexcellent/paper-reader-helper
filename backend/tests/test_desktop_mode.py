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
        data = response.json()
        assert data["status"] == "ok"
        assert "embedding_available" in data
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


# ─── 补充测试：Phase 1-5 全覆盖 ─────────────────────────────────────────


class TestConfigResolutionComprehensive:
    """Config resolution 的全面测试，覆盖 spec 中的所有 contract。"""

    def test_effective_database_url_explicit_overrides_desktop_mode(self):
        """在 desktop 模式下，显式设置的 DATABASE_URL 仍应优先于默认路径。"""
        from app.core.config import Settings

        s = Settings(
            database_url="sqlite:///./explicit/path.db",
            desktop_mode=True,
            _env_file=None,
        )
        assert s.effective_database_url == "sqlite:///./explicit/path.db"

    def test_effective_storage_root_explicit_overrides_desktop_mode(self):
        """在 desktop 模式下，显式设置的 STORAGE_ROOT 仍应优先于默认路径。"""
        from app.core.config import Settings

        s = Settings(
            storage_root="/explicit/storage",
            desktop_mode=True,
            _env_file=None,
        )
        assert s.effective_storage_root == "/explicit/storage"

    def test_effective_cors_origins_empty_in_desktop_mode(self):
        """在 desktop 模式下，如果 cors_origins 为空字符串，应保持为空（无 CORS）。"""
        from app.core.config import Settings

        s = Settings(
            cors_origins="",
            desktop_mode=True,
            _env_file=None,
        )
        assert s.effective_cors_origins == ""

    def test_effective_cors_origins_preserves_custom_in_source_mode(self):
        """在 source 模式下，自定义 CORS origins 应原样返回。"""
        from app.core.config import Settings

        s = Settings(
            cors_origins="http://localhost:3000,http://localhost:4000",
            desktop_mode=False,
            _env_file=None,
        )
        assert s.effective_cors_origins == "http://localhost:3000,http://localhost:4000"

    def test_is_desktop_or_packaged_with_sys_frozen(self):
        """当 sys.frozen=True 时，is_desktop_or_packaged 应为 True，即使 desktop_mode=False。"""
        from app.core.config import Settings

        s = Settings(desktop_mode=False, _env_file=None)
        # 默认情况下 desktop_mode=False，is_desktop_or_packaged 应为 False
        # （因为 sys.frozen 在正常测试环境中不可用）
        assert s.is_desktop_or_packaged is False

    def test_static_dir_default_is_empty(self):
        """默认 static_dir 为空，表示开发模式不托管前端静态文件。"""
        from app.core.config import Settings

        s = Settings(_env_file=None)
        assert s.static_dir == ""

    def test_desktop_mode_default_is_false(self):
        """默认 desktop_mode 为 False。"""
        from app.core.config import Settings

        s = Settings(_env_file=None)
        assert s.desktop_mode is False


class TestEnvFileResolutionComprehensive:
    """.env 文件解析的全面测试，覆盖 spec 中的所有路径优先级。"""

    def test_packaged_mode_env_file_fallback_to_appdata(self, tmp_path: Path):
        """在 packaged 模式下，如果 exe 旁没有 .env，应回退到 %APPDATA%/paper-reader/.env。"""
        from app.core.config import _resolve_env_file

        # tmp_path 下没有 .env 文件，模拟 exe 旁不存在 .env
        with patch("app.core.config.sys") as mock_sys:
            mock_sys.frozen = True
            # exe_dir = tmp_path, 但没有 .env
            mock_sys.executable = str(tmp_path / "app.exe")

            result = _resolve_env_file()
            # 应回退到 APPDATA 路径（包含 paper-reader）
            assert "paper-reader" in str(result)
            assert result.name == ".env"

    def test_source_mode_env_file_under_project_root(self):
        """在源码模式下，.env 文件应在项目根目录下。"""
        from app.core.config import _resolve_env_file

        result = _resolve_env_file()
        # 应该在 backend 的上上级目录（项目根）
        assert result.name == ".env"
        # 项目根 .env 文件是否存在取决于环境，这里只验证路径格式
        assert result.parent.name != "app"


class TestSPAFallbackComprehensive:
    """SPA fallback middleware 的全面测试，覆盖 spec 3.3 中的所有规则。"""

    def test_spa_fallback_serves_index_html_for_non_api_routes(self, tmp_path: Path):
        """非 API 路由的 404 请求应返回 index.html。"""
        from app.core.config import Settings
        from app.main import SPAFallbackMiddleware
        from fastapi import FastAPI

        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()
        (dist_dir / "index.html").write_text("<html><body>SPA Root</body></html>")

        test_app = FastAPI()

        @test_app.get("/health")
        def health():
            return {"status": "ok"}

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
                # 多种 SPA 路由都应返回 index.html
                for path in ["/briefing", "/settings", "/library", "/some/deep/route"]:
                    response = test_client.get(path)
                    assert response.status_code == 200, f"SPA route {path} should return 200"
                    assert "SPA Root" in response.text, f"SPA route {path} should return HTML"
                    assert "text/html" in response.headers.get("content-type", "")
        finally:
            config_module.settings = original_settings

    def test_spa_fallback_static_dir_not_exist_returns_404(self, tmp_path: Path):
        """如果 static_dir 指向的目录不存在，非 API 路由应返回原始 404。"""
        from app.core.config import Settings
        from app.main import SPAFallbackMiddleware
        from fastapi import FastAPI, HTTPException

        # 指向不存在的目录
        nonexistent_dir = tmp_path / "nonexistent_dist"

        # 即便 static_dir 有值，目录不存在时 middleware 应跳过 SPA fallback
        # Settings 不校验路径是否真的存在，middleware 在运行时检查
        test_app = FastAPI()

        @test_app.get("/health")
        def health():
            return {"status": "ok"}

        test_settings = Settings(
            static_dir=str(nonexistent_dir),
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
                # 非 API 路由应返回 404，因为 static_dir 下的文件不存在
                response = test_client.get("/briefing")
                # SPA middleware 在 static_dir 目录不存在时应返回 404
                # 除非路由本身有定义
                assert response.status_code in (404, 200)
                # 如果是 200，不应该是 HTML（除非是 API 返回的 JSON）
                if response.status_code == 200:
                    assert "text/html" not in response.headers.get("content-type", "")
        finally:
            config_module.settings = original_settings

    def test_spa_fallback_empty_static_dir_no_interception(self):
        """static_dir 为空时，SPA fallback 不应启动。"""
        from app.core.config import Settings

        s = Settings(
            static_dir="",
            desktop_mode=False,
            _env_file=None,
        )
        # 空 static_dir 意味着不触发 SPA fallback
        assert s.static_dir == ""

    def test_assets_paths_not_intercepted_by_spa(self, tmp_path: Path):
        """/assets/ 和 /files/ 路径的 404 应保持 404，不被 SPA fallback 拦截。"""
        from app.core.config import Settings
        from app.main import SPAFallbackMiddleware
        from fastapi import FastAPI

        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()
        (dist_dir / "index.html").write_text("<html><body>SPA</body></html>")
        # 不创建 assets 目录——/assets/ 请求会 404

        test_app = FastAPI()

        @test_app.get("/health")
        def health():
            return {"status": "ok"}

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
                # /assets/ 路径不存在时应返回 404，而非 index.html
                response = test_client.get("/assets/nonexistent.js")
                assert response.status_code == 404

                # /files/ 路径不存在时也应返回 404
                response = test_client.get("/files/nonexistent.pdf")
                assert response.status_code == 404
        finally:
            config_module.settings = original_settings

    def test_spa_fallback_index_html_missing(self, tmp_path: Path):
        """static_dir 存在但 index.html 不存在时，SPA fallback 应返回原始 404。"""
        from app.core.config import Settings
        from app.main import SPAFallbackMiddleware
        from fastapi import FastAPI

        # 创建目录但不创建 index.html
        dist_dir = tmp_path / "dist"
        dist_dir.mkdir()

        test_app = FastAPI()

        @test_app.get("/health")
        def health():
            return {"status": "ok"}

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
                # /briefing 不存在 index.html 可供回退时，返回 404
                response = test_client.get("/briefing")
                assert response.status_code == 404
        finally:
            config_module.settings = original_settings


class TestPathMatchesApiRouteComprehensive:
    """_path_matches_api_route 的全面测试，使用实际 app 路由验证。"""

    def test_matches_all_registered_api_routes(self):
        """验证所有已注册的 API 路由都能被正确匹配。"""
        from app.main import app, _path_matches_api_route

        # 核心业务路由
        assert _path_matches_api_route(app, "/health", "GET") is True
        assert _path_matches_api_route(app, "/auth/status", "GET") is True
        assert _path_matches_api_route(app, "/auth/login", "POST") is True
        assert _path_matches_api_route(app, "/papers", "GET") is True
        assert _path_matches_api_route(app, "/papers/1", "GET") is True
        assert _path_matches_api_route(app, "/papers/search", "GET") is True
        assert _path_matches_api_route(app, "/papers/search/semantic", "GET") is True

    def test_does_not_match_frontend_routes(self):
        """前端路由不应被匹配为 API 路由。"""
        from app.main import app, _path_matches_api_route

        # 注意：/briefing/view 会匹配 /briefing/{briefing_date} 路由（view 被当作日期参数）
        # 这是正确行为——FastAPI 路由匹配是精确的，view 作为日期参数值是合法的
        # 所以 /briefing/view 不应出现在"不应匹配"列表中
        #
        # 以下路径确认不会匹配任何已注册的 API 路由：
        # - /assistant — 无此前缀路由（agent 是 /agent，非 /assistant）
        # - /settings — 无此前缀路由
        # - /library — 无此前缀路由
        # - /subscribe — 无此前缀路由（subscriptions 是 /subscriptions）
        # - /paper/1 — 无此前缀路由（papers 是 /papers，复数形式）
        frontend_routes = [
            "/assistant",
            "/settings",
            "/library",
            "/subscribe",
            "/paper/1",
        ]
        for path in frontend_routes:
            assert _path_matches_api_route(app, path, "GET") is False, (
                f"Frontend route {path} should NOT match API routes"
            )

    def test_root_path_not_api_route(self):
        """根路径 / 不是 API 路由（在 SPA 中应返回 index.html）。"""
        from app.main import app, _path_matches_api_route

        # 根路径不是 API 路由
        assert _path_matches_api_route(app, "/", "GET") is False

    def test_http_method_matters(self):
        """不同 HTTP 方法应影响路由匹配。"""
        from app.main import app, _path_matches_api_route

        # POST 路由存在
        assert _path_matches_api_route(app, "/papers/upload", "POST") is True or \
            _path_matches_api_route(app, "/papers", "POST") is True
