# 桌面应用化（Tauri 封装）

## Goal

将 paper-reader-helper 打包为独立桌面应用：双击桌面图标 → 打开独立窗口（非浏览器标签页）→ Python 后端作为 sidecar 自动启动 → 关闭窗口时后端终止。保留热更新的开发体验。

## Decision (ADR-lite)

**Context**: 用户希望像商业桌面应用一样使用，不要浏览器标签页。

**Decision**: 使用 Tauri v2 封装，Python 后端作为 sidecar 进程。

**Consequences**:
- 需要引入 Rust 工具链（cargo + tauri-cli）
- 新增 `src-tauri/` 目录和 Tauri 配置
- Python 后端需 PyInstaller 打包为 exe（排除 sentence-transformers，作为可选安装）
- 开发模式保留 `vite dev` + `uvicorn --reload` 热更新不变

## Requirements

### 核心功能

1. **独立窗口**: Tauri WebView2 窗口（非浏览器标签页），有应用图标和标题
2. **后端 sidecar**: Tauri 启动时自动 spawn Python 后端 exe，关闭窗口时终止
3. **健康检查**: 前端加载前轮询后端 `/health`，就绪后显示主界面；超时显示加载/错误状态
4. **sentence-transformers 可选**: 打包时排除 ML 依赖（减小体积），用户可在设置中选择安装 embedding 模型
5. **开发模式保留**: `tauri dev` 仍使用 `vite dev` + `uvicorn --reload`，热更新不受影响

### 打包与分发

6. **PyInstaller 打包后端**: 排除 sentence-transformers 和 torch，体积控制在 ~200MB 以内
7. **Tauri 构建**: NSIS 或 MSI 安装包，包含前端 dist + 后端 exe
8. **.env 处理**: 打包后 .env 路径需要从 exe 旁或用户数据目录读取，不依赖源码目录结构
9. **数据目录**: SQLite 和 storage 路径需要适配桌面应用数据目录（如 `%APPDATA%/paper-reader/`）

### SPA 路由

10. **SPA fallback**: 前端所有非 API 路由返回 `index.html`（由 FastAPI 在生产模式托管）
11. **CORS 适配**: 生产模式前端与后端同源（`localhost:8000`），CORS 配置需兼容生产模式

## Acceptance Criteria

* [ ] 双击桌面图标 → 打开独立应用窗口，无浏览器地址栏
* [ ] 应用窗口内可正常使用所有功能（导入、论文列表、阅读器、Agent、翻译等）
* [ ] 关闭窗口 → 后端 sidecar 进程终止
* [ ] SPA 路由刷新不 404
* [ ] `npm run build` 前端可由 FastAPI 托管
* [ ] 开发模式 `tauri dev` 保留热更新
* [ ] PyInstaller 打包后端 exe 可独立运行（不含 sentence-transformers）
* [ ] 用户可选安装 embedding 模型（设置中有开关/引导）
* [ ] `.env` 和数据目录路径在打包后正确解析
* [ ] Lint / typecheck / 测试通过

## Definition of Done

* 上述验收标准全部通过
* `src-tauri/` 配置完善、有注释
* PyInstaller spec 文件或 hook 可维护
* 安装包可在纯净 Windows 10+ 环境运行
* 文档说明开发和构建流程

## Out of Scope

* 系统托盘图标（后续可加）
* 自动更新（后续可加 via tauri-updater）
* Linux/macOS 构建（本阶段只做 Windows）
* 移动端适配
* Electron 方案备选

## Implementation Plan

### Phase 1: 生产模式 — FastAPI 托管前端静态文件

在引入 Tauri 之前，先让后端能单进程提供完整服务：

**改动文件**:
- `backend/app/core/config.py`: 添加 `static_dir` 配置项，适配 `.env` 路径和 `database_url` 支持打包后环境
- `backend/app/main.py`: 添加 `StaticFiles` mount + SPA fallback 中间件，生产模式入口
- `frontend/vite.config.ts`: 确认 `base: '/'` 配置
- `frontend/src/lib/api.ts`: `VITE_API_BASE` 在生产模式下为空（同源访问，默认值 `''`）
- `.env.example`: 添加 `STATIC_DIR` 和 `DESKTOP_MODE` 说明

**验收**: `npm run build && uvicorn` 后 `http://localhost:8000` 可正常使用全部功能，SPA 刷新不 404。

### Phase 2: 启动脚本

创建一键启动脚本，验证 sidecar 管理可行：

**新增文件**:
- `start.bat`: Windows 批处理脚本，启动后端 → 轮询 health → 打开浏览器 → 等待关闭

**验收**: 双击 `start.bat` → 浏览器自动打开应用，关闭终端窗口 → 后端进程终止。

### Phase 3: Tauri 封装

引入 Tauri 框架，创建独立窗口应用：

**新增目录/文件**:
- `src-tauri/tauri.conf.json`: 窗口配置、sidecar 定义、打包设置
- `src-tauri/src/main.rs`: Rust 入口，管理 sidecar 生命周期
- `src-tauri/Cargo.toml`: Rust 依赖
- `src-tauri/icons/`: 应用图标

**改动文件**:
- `frontend/package.json`: 添加 `tauri` dev/build 脚本

**验收**: `tauri dev` 启动独立窗口，热更新正常；关闭窗口 → sidecar 终止。

### Phase 4: PyInstaller 打包后端

将 Python 后端打包为独立 exe：

**新增文件**:
- `backend/paper-reader-backend.spec`: PyInstaller spec 文件，排除 sentence-transformers 和 torch

**改动文件**:
- `backend/app/core/config.py`: 路径解析适配打包后环境（`sys._MEIPASS`、`%APPDATA%`）
- `backend/app/core/db.py`: 数据库路径适配桌面数据目录

**验收**: `pyinstaller` 生成的 exe 可独立运行，`http://localhost:8000` 服务正常。

### Phase 5: sentence-transformers 可选安装

**改动文件**:
- `backend/app/services/embedding_service.py`: 检测模型可用性，不可用时给出安装引导
- 前端设置页：添加 embedding 安装引导 UI

**验收**: 打包版本首次打开时，embedding 功能给出提示而非崩溃；用户可选择安装。

## Technical Notes

### 关键代码位置

| 文件 | 现状 | 改动方向 |
|------|------|----------|
| `backend/app/core/config.py:6` | `ENV_FILE = Path(__file__).resolve().parents[2] / ".env"` | 需支持打包后从 exe 旁或 `%APPDATA%` 读取 |
| `backend/app/core/config.py:11` | `database_url = "sqlite:///./data/paper_reader.db"` | 打包后需使用 `%APPDATA%/paper-reader/` 路径 |
| `backend/app/core/config.py:12` | `storage_root = "./data/storage"` | 打包后需使用 `%APPDATA%/paper-reader/storage` |
| `backend/app/core/config.py:18` | `cors_origins = "http://localhost:3000"` | 生产模式需兼容同源访问 |
| `backend/app/main.py:96-99` | 只挂载 `/files` 静态文件 | 需添加 SPA fallback + 前端 dist 托管 |
| `frontend/src/lib/api.ts:26` | `API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'` | 生产模式需为空（同源） |
| `frontend/vite.config.ts` | 无 `base` 配置 | 确认 `base: '/'` 即可 |

### 关键架构

```
Tauri 窗口 (WebView2)
├── 加载 http://localhost:8000 (后端 sidecar 托管前端 + API)
├── sidecar: backend.exe (PyInstaller 打包)
├── 窗口关闭 → kill sidecar 进程
└── 开发模式: tauri dev → vite dev + uvicorn --reload

后端单进程架构（生产模式）:
FastAPI (port 8000)
├── /api/* → 后端路由
├── /files/* → 存储文件
└── /* → SPA fallback → frontend/dist/index.html
```

### sentence-transformers 可选安装方案

- 打包时 `--exclude-module sentence_transformers,torch`
- 首次使用 embedding 功能时检测模型是否可用
- 不可用时在设置中引导用户安装（`pip install sentence-transformers` 或下载预编译包）

### Research References

* [`research/desktop-packaging-options.md`](research/desktop-packaging-options.md) — 四种桌面打包方案详细对比