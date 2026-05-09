# 桌面应用构建与开发指南

Paper Reader 可以作为独立桌面应用运行（Tauri + Python sidecar），也可以保持传统的前后端分离开发模式。

---

## 快速启动（开发模式）

前后端分离，热更新：

```bash
# 终端 1：后端
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 终端 2：前端
cd frontend
npm run dev
```

浏览器访问 `http://localhost:3000`。

---

## 桌面模式（一键启动）

双击 `start.bat`，后端托管前端静态文件，浏览器自动打开 `http://localhost:8000`。

前提：前端已构建（`cd frontend && npm run build`）。

---

## Tauri 桌面窗口（独立应用）

### 开发模式

```bash
cd frontend
npm run tauri:dev
```

Tauri 会自动启动 Vite dev server + Python 后端（通过 `uv run uvicorn`），打开独立窗口。

### 构建安装包

```bash
cd frontend
npm run tauri:build
```

需要先完成 PyInstaller 打包（见下方）。

---

## PyInstaller 打包后端

将 Python 后端打包为独立 exe，作为 Tauri sidecar：

```bash
python backend/build_exe.py --noconfirm
```

该脚本会：
1. 构建前端（如果 `frontend/dist/` 不存在）
2. 运行 PyInstaller（使用 `backend/paper-reader-backend.spec`）
3. 将 `frontend/dist/` 复制到输出目录

输出位置：`backend/dist/paper-reader-backend/`

### 测试打包结果

```bash
cd backend/dist/paper-reader-backend
set DESKTOP_MODE=true
set STATIC_DIR=frontend/dist
.\paper-reader-backend.exe
```

访问 `http://localhost:8000` 验证。

---

## 环境变量

| 变量 | 开发模式 | 桌面/打包模式 | 说明 |
|------|----------|---------------|------|
| `DESKTOP_MODE` | `false`（默认） | `true` | 控制路径解析和静态文件托管 |
| `STATIC_DIR` | 空（不托管） | `../frontend/dist` | 前端静态文件路径 |
| `DATABASE_URL` | `sqlite:///./data/paper_reader.db` | 自动解析到 `%APPDATA%` | 留空使用模式默认值 |
| `STORAGE_ROOT` | `./data/storage` | 自动解析到 `%APPDATA%` | 留空使用模式默认值 |
| `CORS_ORIGINS` | `http://localhost:3000` | `http://localhost:8000` | 桌面模式同源，无需 CORS |
| `VITE_API_BASE` | `http://localhost:8000` | 空（同源） | 构建时注入 |

---

## 目录结构

```
paper-reader-helper/
├── start.bat                    # Windows 一键启动脚本
├── src-tauri/                   # Tauri 配置和 Rust 代码
│   ├── tauri.conf.json          # 窗口、sidecar、打包配置
│   ├── src/main.rs              # Rust 入口
│   ├── src/lib.rs               # sidecar 生命周期管理
│   └── Cargo.toml               # Rust 依赖
├── backend/
│   ├── paper-reader-backend.spec # PyInstaller 打包配置
│   ├── build_exe.py             # 构建辅助脚本
│   └── app/
│       ├── core/config.py       # 环境检测 + 路径解析
│       └── main.py              # SPA fallback middleware
└── frontend/
    ├── .env.development         # VITE_API_BASE=http://localhost:8000
    ├── .env.production          # VITE_API_BASE=（空，同源）
    └── src/components/
        ├── EmbeddingNotice.tsx   # embedding 不可用提示
        └── useHealthCheck.ts    # 后端健康检查 hook
```

---

## Embedding（向量化）可选安装

桌面打包版本不包含 `sentence-transformers`（减小体积约 1.5GB）。

- 应用启动后，如果 embedding 不可用，顶部会显示提示 banner
- 用户可按提示安装：`pip install sentence-transformers`
- 安装后重启应用即可使用语义搜索功能

---

## 注意事项

- 仅支持 Windows 10+（本阶段）
- Tauri 需要 WebView2 运行时（Windows 10 1803+ 已内置）
- PyInstaller 打包需要在目标平台上执行
- `backend/.env` 是本地开发配置，已 gitignore
