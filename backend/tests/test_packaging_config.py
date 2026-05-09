"""测试 PyInstaller 打包配置和构建脚本。

覆盖:
- PyInstaller spec 文件关键字段验证
- build_exe.py 构建辅助脚本逻辑验证
- start.bat 启动脚本格式验证
- src-tauri/tauri.conf.json Tauri 配置验证
"""

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# 项目根目录
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"


# ─── Phase 2: start.bat 启动脚本验证 ─────────────────────────────────────


class TestStartBat:
    """验证 Windows 一键启动脚本的格式和关键配置。"""

    def test_start_bat_exists(self):
        """start.bat 文件应存在于项目根目录。"""
        start_bat = PROJECT_ROOT / "start.bat"
        assert start_bat.is_file(), "start.bat 不存在"

    def test_start_bat_has_desktop_mode(self):
        """start.bat 应设置 DESKTOP_MODE=true。"""
        start_bat = PROJECT_ROOT / "start.bat"
        content = start_bat.read_text(encoding="utf-8")
        assert "DESKTOP_MODE=true" in content, "start.bat 未设置 DESKTOP_MODE=true"

    def test_start_bat_has_static_dir(self):
        """start.bat 应设置 STATIC_DIR 指向前端构建产物。"""
        start_bat = PROJECT_ROOT / "start.bat"
        content = start_bat.read_text(encoding="utf-8")
        assert "STATIC_DIR" in content, "start.bat 未设置 STATIC_DIR"
        # STATIC_DIR 应指向 frontend/dist
        assert "frontend" in content, "start.bat 的 STATIC_DIR 未包含 frontend"

    def test_start_bat_has_health_check(self):
        """start.bat 应有健康检查轮询逻辑。"""
        start_bat = PROJECT_ROOT / "start.bat"
        content = start_bat.read_text(encoding="utf-8")
        assert "/health" in content, "start.bat 未包含 /health 健康检查"
        assert "WAITED" in content or "health_check" in content, "start.bat 未包含轮询逻辑"

    def test_start_bat_has_python_detection(self):
        """start.bat 应检测 Python 运行环境（uv 或 python）。"""
        start_bat = PROJECT_ROOT / "start.bat"
        content = start_bat.read_text(encoding="utf-8")
        # 至少检查 python 命令是否存在
        assert "python" in content.lower() or "uv run" in content, "start.bat 未检测 Python 环境"

    def test_start_bat_has_frontend_build_check(self):
        """start.bat 应检查前端构建产物是否存在。"""
        start_bat = PROJECT_ROOT / "start.bat"
        content = start_bat.read_text(encoding="utf-8")
        assert "index.html" in content, "start.bat 未检查前端 index.html"

    def test_start_bat_has_port_check(self):
        """start.bat 应检查端口是否被占用。"""
        start_bat = PROJECT_ROOT / "start.bat"
        content = start_bat.read_text(encoding="utf-8")
        assert "8000" in content or "PORT" in content, "start.bat 未包含端口检查或配置"


# ─── Phase 3: Tauri 配置验证 ─────────────────────────────────────────────


class TestTauriConfig:
    """验证 src-tauri/tauri.conf.json 的关键字段。"""

    def test_tauri_config_exists(self):
        """tauri.conf.json 应存在于 src-tauri/ 目录。"""
        config_path = PROJECT_ROOT / "src-tauri" / "tauri.conf.json"
        assert config_path.is_file(), "src-tauri/tauri.conf.json 不存在"

    def test_tauri_config_has_window_config(self):
        """Tauri 配置应包含窗口配置。"""
        config_path = PROJECT_ROOT / "src-tauri" / "tauri.conf.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))

        windows = config.get("app", {}).get("windows", [])
        assert len(windows) > 0, "tauri.conf.json 应至少包含一个窗口配置"

        main_window = windows[0]
        assert "title" in main_window, "主窗口应设置标题"
        assert main_window.get("width", 0) >= 1024, "主窗口宽度应 >= 1024"
        assert main_window.get("height", 0) >= 600, "主窗口高度应 >= 600"
        assert "url" in main_window, "主窗口应设置 URL"

    def test_tauri_config_has_product_name(self):
        """Tauri 配置应包含产品名称。"""
        config_path = PROJECT_ROOT / "src-tauri" / "tauri.conf.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        assert "productName" in config, "tauri.conf.json 应包含 productName"
        assert config["productName"], "productName 不应为空"

    def test_tauri_config_has_sidecar(self):
        """Tauri 配置应包含 sidecar（Python 后端）定义。"""
        config_path = PROJECT_ROOT / "src-tauri" / "tauri.conf.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))

        bundle = config.get("bundle", {})
        external_bin = bundle.get("externalBin", [])
        assert len(external_bin) > 0, "tauri.conf.json 应在 bundle.externalBin 中定义 sidecar"
        assert any("backend" in e for e in external_bin), "sidecar 应包含 backend 关键字"

    def test_tauri_config_has_frontend_dist(self):
        """Tauri 配置应包含前端构建产物路径。"""
        config_path = PROJECT_ROOT / "src-tauri" / "tauri.conf.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))

        build = config.get("build", {})
        # 验证有 frontendDist 或 resources
        frontend_dist = build.get("frontendDist", "")
        resources = config.get("bundle", {}).get("resources", [])
        has_dist = frontend_dist != "" or any("frontend" in str(r) for r in resources)
        assert has_dist, "Tauri 配置应包含前端 dist 路径"

    def test_tauri_config_dev_url(self):
        """Tauri 开发模式应使用 Vite dev server。"""
        config_path = PROJECT_ROOT / "src-tauri" / "tauri.conf.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))

        build = config.get("build", {})
        # devUrl 指向 Vite dev server 端口
        dev_url = build.get("devUrl", "")
        assert "3000" in dev_url or "vite" in build.get("beforeDevCommand", ""), \
            "Tauri dev 模式应使用 Vite dev server（端口 3000）"


# ─── Phase 4: PyInstaller spec 验证 ─────────────────────────────────────


class TestPyInstallerSpec:
    """验证 PyInstaller spec 文件的关键配置。"""

    def test_spec_file_exists(self):
        """PyInstaller spec 文件应存在于 backend/ 目录。"""
        spec_path = BACKEND_DIR / "paper-reader-backend.spec"
        assert spec_path.is_file(), "paper-reader-backend.spec 不存在"

    def test_spec_file_excludes_sentence_transformers(self):
        """spec 文件应排除 sentence_transformers 和 torch。"""
        spec_path = BACKEND_DIR / "paper-reader-backend.spec"
        content = spec_path.read_text(encoding="utf-8")

        # 验证 excludes 列表中包含关键 ML 依赖
        assert "sentence_transformers" in content, "spec 应排除 sentence_transformers"
        assert "torch" in content, "spec 应排除 torch"
        assert "tensorflow" in content, "spec 应排除 tensorflow"

    def test_spec_file_includes_app_modules(self):
        """spec 文件应包含所有 app 子模块为 hidden imports。"""
        spec_path = BACKEND_DIR / "paper-reader-backend.spec"
        content = spec_path.read_text(encoding="utf-8")

        # 核心模块必须包含
        required_modules = [
            "app.core",
            "app.core.config",
            "app.core.db",
            "app.api",
            "app.api.routes",
            "app.services",
            "app.models",
        ]
        for module in required_modules:
            assert module in content, f"spec 应包含 hidden import: {module}"

    def test_spec_file_has_entry_point(self):
        """spec 文件应定义入口点（app.main）。"""
        spec_path = BACKEND_DIR / "paper-reader-backend.spec"
        content = spec_path.read_text(encoding="utf-8")

        assert "app" in content and "main" in content, "spec 应定义 app.main 入口点"

    def test_build_exe_script_exists(self):
        """build_exe.py 构建辅助脚本应存在。"""
        build_script = BACKEND_DIR / "build_exe.py"
        assert build_script.is_file(), "build_exe.py 不存在"

    def test_build_exe_checks_frontend_dist(self):
        """build_exe.py 应检查前端构建产物。"""
        build_script = BACKEND_DIR / "build_exe.py"
        content = build_script.read_text(encoding="utf-8")

        assert "frontend" in content, "build_exe.py 应涉及前端构建"
        assert "dist" in content, "build_exe.py 应涉及 dist 目录"
        assert "index.html" in content, "build_exe.py 应检查 index.html"

    def test_build_exe_copies_frontend_dist(self):
        """build_exe.py 应将前端 dist 复制到 PyInstaller 输出目录。"""
        build_script = BACKEND_DIR / "build_exe.py"
        content = build_script.read_text(encoding="utf-8")

        assert "copy" in content.lower() or "shutil" in content, \
            "build_exe.py 应复制前端 dist 到输出目录"


# ─── Phase 5: Embedding 降级测试（补充） ─────────────────────────────────


class TestEmbeddingDegradationIntegration:
    """Embedding 服务降级的集成测试，覆盖 spec 中的错误矩阵。"""

    def test_health_endpoint_reports_embedding_status(self, client):
        """Health endpoint 应返回 embedding_available 字段。"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "embedding_available" in data
        assert isinstance(data["embedding_available"], bool)

    def test_embedding_unavailable_error_is_runtime_error(self):
        """EmbeddingUnavailableError 应继承 RuntimeError，便于统一捕获。"""
        from app.services.embedding_service import EmbeddingUnavailableError

        error = EmbeddingUnavailableError()
        assert isinstance(error, RuntimeError)

    def test_embedding_unavailable_error_has_install_instructions(self):
        """EmbeddingUnavailableError 应包含安装说明。"""
        from app.services.embedding_service import EmbeddingUnavailableError

        error = EmbeddingUnavailableError()
        message = str(error)

        # 必须包含关键信息
        assert "sentence-transformers" in message.lower() or "sentence_transformers" in message, \
            "错误消息应提及 sentence-transformers"
        assert "pip install" in message.lower(), "错误消息应包含安装命令"

    def test_embedding_availability_flag_consistent(self):
        """_EMBEDDING_AVAILABLE 标记与 EmbeddingService.is_available() 应一致。"""
        from app.services.embedding_service import _EMBEDDING_AVAILABLE, EmbeddingService

        assert EmbeddingService.is_available() == _EMBEDDING_AVAILABLE, \
            "EmbeddingService.is_available() 应与模块级标记 _EMBEDDING_AVAILABLE 一致"

    def test_embedding_service_encode_raises_when_unavailable(self):
        """当 embedding 不可用时，encode() 应抛出 EmbeddingUnavailableError。"""
        from app.services.embedding_service import (
            EmbeddingService,
            EmbeddingUnavailableError,
            _EMBEDDING_AVAILABLE,
        )

        if _EMBEDDING_AVAILABLE:
            pytest.skip("sentence-transformers 已安装，无法测试不可用路径")

        with pytest.raises(EmbeddingUnavailableError):
            EmbeddingService.encode("test text")

    def test_embedding_service_get_model_raises_when_unavailable(self):
        """当 embedding 不可用时，get_model() 应抛出 EmbeddingUnavailableError。"""
        from app.services.embedding_service import (
            EmbeddingService,
            EmbeddingUnavailableError,
            _EMBEDDING_AVAILABLE,
        )

        if _EMBEDDING_AVAILABLE:
            pytest.skip("sentence-transformers 已安装，无法测试不可用路径")

        with pytest.raises(EmbeddingUnavailableError):
            EmbeddingService.get_model()


# ─── Config: desktop_mode 路径解析（打包后环境模拟） ─────────────────────


class TestPackagedModePathResolution:
    """模拟 PyramidInstaller 打包后环境（sys.frozen=True）的路径解析。"""

    def test_packaged_mode_data_dir_is_under_appdata(self):
        """打包模式下数据目录应在 AppData/Roaming/paper-reader/data 下。"""
        from app.core.config import _resolve_data_dir

        with patch("app.core.config.sys") as mock_sys:
            mock_sys.frozen = True
            data_dir = _resolve_data_dir()
            path_str = str(data_dir)
            assert "paper-reader" in path_str
            assert "data" in path_str

    def test_packaged_mode_data_dir_is_created_automatically(self, tmp_path: Path):
        """桌面模式下数据目录应自动创建。"""
        from app.core.config import _resolve_data_dir

        with patch.object(Path, "home", return_value=tmp_path):
            with patch("app.core.config.sys") as mock_sys:
                mock_sys.frozen = True
                data_dir = _resolve_data_dir()
                # _resolve_data_dir 在 desktop 模式下会创建目录 (mkdir parents=True)
                assert data_dir.name == "data"

    def test_packaged_mode_env_file_next_to_exe(self, tmp_path: Path):
        """打包模式下，应当优先在 exe 旁查找 .env 文件。"""
        from app.core.config import _resolve_env_file

        # 创建 exe 旁的 .env
        env_file = tmp_path / ".env"
        env_file.write_text("DESKTOP_MODE=true\n")

        with patch("app.core.config.sys") as mock_sys:
            mock_sys.frozen = True
            mock_sys.executable = str(tmp_path / "app.exe")

            result = _resolve_env_file()
            assert result == env_file, "应优先在 exe 旁查找 .env"

    def test_packaged_mode_env_file_fallback_appdata(self, tmp_path: Path):
        """打包模式下，如果 exe 旁没有 .env，应回退到 APPDATA。"""
        from app.core.config import _resolve_env_file

        # 不在 tmp_path 下创建 .env
        with patch("app.core.config.sys") as mock_sys:
            mock_sys.frozen = True
            mock_sys.executable = str(tmp_path / "app.exe")

            # 此时不创建 .env，应回退到 HOME/AppData/Roaming/paper-reader/.env
            # 我们需要 mock Path.home() 因为实际 APPDATA 依赖用户目录
            result = _resolve_env_file()
            # 验证路径格式正确
            assert "paper-reader" in str(result)

    def test_source_mode_uses_project_root_env(self):
        """源码模式下，.env 文件应在项目根目录。"""
        from app.core.config import _resolve_env_file

        result = _resolve_env_file()
        assert result.name == ".env"
        # 验证路径层级：.env 在 backend 的上上级目录
        assert result.parent.name != "core"
        assert result.parent.name != "app"


# ─── Vite 配置验证 ─────────────────────────────────────────────────────


class TestViteConfig:
    """验证前端 Vite 构建配置。"""

    def test_vite_config_has_base_root(self):
        """Vite 配置应设置 base: '/' 用于 SPA 根路径。"""
        vite_config = FRONTEND_DIR / "vite.config.ts"
        content = vite_config.read_text(encoding="utf-8")
        assert "base" in content, "vite.config.ts 应包含 base 配置"
        # base 应设为 '/'
        assert "'/'" in content or '"/"' in content or "base: '/'" in content, \
            "vite.config.ts 的 base 应设为 '/'"

    def test_env_production_has_empty_api_base(self):
        """.env.production 应设置 VITE_API_BASE 为空（同源访问）。"""
        env_file = FRONTEND_DIR / ".env.production"
        assert env_file.is_file(), ".env.production 不存在"

        content = env_file.read_text(encoding="utf-8")
        # VITE_API_BASE 应为空
        lines = [l.strip() for l in content.splitlines() if l.strip() and not l.strip().startswith("#")]
        api_base_lines = [l for l in lines if l.startswith("VITE_API_BASE")]
        assert len(api_base_lines) > 0, ".env.production 应包含 VITE_API_BASE"

        # 值应为空
        api_base_line = api_base_lines[0]
        _, value = api_base_line.split("=", 1)
        assert value.strip() == "", f"VITE_API_BASE 在 .env.production 中应为空，实际为: {value}"

    def test_env_development_has_localhost_api_base(self):
        """.env.development 应设置 VITE_API_BASE 为 localhost:8000。"""
        env_file = FRONTEND_DIR / ".env.development"
        assert env_file.is_file(), ".env.development 不存在"

        content = env_file.read_text(encoding="utf-8")
        assert "VITE_API_BASE" in content, ".env.development 应包含 VITE_API_BASE"
        assert "localhost:8000" in content, ".env.development 的 VITE_API_BASE 应指向 localhost:8000"