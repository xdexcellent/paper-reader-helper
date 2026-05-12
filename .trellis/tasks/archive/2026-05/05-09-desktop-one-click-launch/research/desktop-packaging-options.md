# Research: 桌面打包方案对比

- **Query**: 如何将 FastAPI + React/Vite Web 应用打包为 Windows 桌面应用，实现双击快捷方式一键启动
- **Scope**: 混合（内部代码分析 + 外部技术调研）
- **Date**: 2026-05-09

## 项目现状分析

### 关键文件

| File Path | Description |
|---|---|
| `backend/app/main.py` | FastAPI 入口，含 lifespan（init_db + scheduler） |
| `backend/app/core/config.py` | pydantic-settings 配置，ENV_FILE 指向项目根 `.env` |
| `backend/pyproject.toml` | Python 依赖：fastapi, uvicorn, sqlmodel, sentence-transformers 等 |
| `frontend/package.json` | React 18 + Vite 6，前端构建产物在 `frontend/dist/` |
| `frontend/vite.config.ts` | 前端开发端口 3000，无 proxy 配置 |
| `.env.example` | 环境变量模板：DATABASE_URL, API keys 等 |

### 重要依赖和约束

1. **sentence-transformers** (`BAAI/bge-m3`)：后端有 EmbeddingService 懒加载模型。此依赖包含 PyTorch/TensorFlow，打包后体积会非常大（约 1-2GB），这是所有打包方案的重大挑战。
2. **SQLite 数据库**：`data/paper_reader.db` 和 `data/storage/` 目录，需在打包后保持可写。
3. **.env 配置**：项目使用 pydantic-settings，打包后 `.env` 文件路径解析 (`ENV_FILE = Path(__file__).resolve().parents[2] / ".env"`) 需要调整。
4. **前端构建产物**：当前 `npm run build` 输出到 `frontend/dist/`，后端未托管这些静态文件（只托管了 `/files` 路径的存储文件）。
5. **CORS 配置**：`cors_origins` 当前为 `http://localhost:3000`，桌面模式需调整。

---

## 方案对比

### 方案 1：PyInstaller + subprocess 启动器

**原理**：用 PyInstaller 将 Python 后端打包成单个 exe，将前端 `dist/` 嵌入为资源，编写启动器脚本（bat/exe）启动 uvicorn 并自动打开浏览器。

**架构**：
```
launcher.exe (PyInstaller 生成的 Python 入口)
├── 启动 uvicorn 子进程（--no-console 模式）
├── 等待后端就绪（轮询 /health）
├── webbrowser.open('http://localhost:8000')
└── 信号处理：Ctrl+C 时终止 uvicorn
```

或者更简单的方式：一个 `.bat` 脚本替代 launcher.exe，因 PRD 中"Out of Scope"已说明不需框架级打包。

**优势**：
- ✅ 最简单的方案，几乎不需要改架构
- ✅ 可用 `.bat` 脚本作为快捷方式（比打包 exe 更简单）
- ✅ 前后端代码路径不变，只需改 FastAPI 挂载静态文件的配置
- ✅ 桌面体验：`pythonw.exe` 启动可隐藏终端窗口，或用 `.vbs` 脚本包一层
- ✅ PyInstaller 社区最成熟，遇到问题容易找到解决方案
- ✅ 支持 `--noconsole` / `--windowed` 模式隐藏终端

**劣势**：
- ❌ 终端窗口问题：直接用 `.bat` 或 `cmd` 启动会有黑色终端闪现
- ❌ 打包后体积大（sentence-transformers 含 PyTorch → 1-2GB+）
- ❌ `.env` 路径硬编码为 `Path(__file__).resolve().parents[2] / ".env"`，打包后路径不同
- ❌ PyInstaller 对动态 import（如 `sentence_transformers`）需要额外 hook 配置
- ❌ 桌面图标：需要额外的 MSI installer 或手动创建快捷方式
- ❌ 自动更新需自行实现

**原生感评估**：
- 无自定义窗口栏 → 使用浏览器窗口，用户体验类似 localhost web 应用
- 任务栏图标 = 浏览器图标，非自有应用图标
- 关闭浏览器 ≠ 关闭后端（需要通知机制或系统托盘）

**适用场景**：快速原型，不追求"原生"桌面体验，只需一键启动

---

### 方案 2：Electron 封装

**原理**：用 Electron 创建一个独立浏览器窗口，内嵌 web UI，后端作为子进程运行。

**架构**：
```
Electron main process
├── BrowserWindow（加载 http://localhost:8000 或本地 dist/index.html）
├── child_process.spawn('python backend/start.py') 或 PyInstaller 打包的 exe
└── 窗口关闭时Kill backend 子进程
```

**优势**：
- ✅ 自定义窗口栏（frameless window + 自定义标题栏）
- ✅ 系统托盘图标（`Tray` API）
- ✅ 任务栏显示自有应用图标
- ✅ 成熟的自动更新方案（`electron-updater`）
- ✅ 丰富的桌面集成 API（通知、文件对话框、全局快捷键等）
- ✅ 最大的社区和生态，遇到问题资料最多

**劣势**：
- ❌ Chromium 内核捆绑，安装包约 150-200MB（不含 Python 后端）
- ❌ 内存占用高（Electron 自身 ~100-200MB）
- ❌ 需要两个技术栈（Node.js + Python），构建流程复杂
- ❌ 后端仍需 PyInstaller 打包或要求用户安装 Python
- ❌ 方案重：为"一键启动"引入了整个 Chromium 引擎
- ❌ 前端需要微调：Electron 里访问 `localhost:8000` 时 CORS 和路径可能需要调整

**原生感评估**：
- 可以做到完全原生感的窗口（自定义标题栏）
- 任务栏和系统托盘自有图标 ✅
- 窗口关闭可绑定后端清理 ✅
- 但整体沉重，对于工具类应用有点杀鸡用牛刀

**适用场景**：需要原生桌面体验、需要系统托盘、系统通知等深度桌面集成

---

### 方案 3：Tauri 封装

**原理**：Tauri（Rust）创建原生窗口（WebView2 on Windows），Python 后端作为 sidecar 进程运行。

**架构**：
```
Tauri 窗口 (src-tauri/)
├── WebView2 加载前端 dist/ 或 http://localhost:8000
├── sidecar: PyInstaller 打包的 Python 后端 exe
├── Shell plugin 管理后端进程生命周期
└── 前端→Rust→sidecar IPC 通道
```

**Tauri sidecar 机制**（来自官方文档）：
- `tauri.conf.json` 中 `bundle.externalBin` 配置 sidecar 路径
- sidecar 二进制需要加 `-$TARGET_TRIPLE` 后缀（如 `backend-x86_64-pc-windows-msvc.exe`）
- 从 Rust 端：`app.shell().sidecar("backend").spawn()`
- 从 JS 端：`Command.sidecar('backend')`
- 可监听子进程 stdout/stderr 事件

**优势**：
- ✅ 安装包极小（不含后端约 3-10MB），因为使用系统 WebView2
- ✅ 内存占用远低于 Electron（Tauri 主进程 ~10-30MB vs Electron ~100-200MB）
- ✅ Rust 安全性：内存安全、线程安全
- ✅ 丰富的插件生态：system-tray, single-instance, autostart, updater, notifications 等
- ✅ 有专门的 sidecar 机制管理外部二进制（完美适配 Python 后端）
- ✅ 支持前端 Vite 项目（官方有 Vite 模板）
- ✅ 自动更新支持（updater 插件）
- ✅ Windows installer (MSI/NSIS) 支持

**劣势**：
- ❌ 需要 Rust 工具链（构建层面增加了复杂度）
- ❌ sidecar 进程（Python 后端）仍需 PyInstaller 打包
- ❌ sentence-transformers 打包体积问题依旧（1-2GB+）
- ❌ WebView2 依赖（Windows 10+ 默认已安装；Win7 需额外安装）
- ❌ 社区规模小于 Electron（但 Tauri v2 已比较成熟）
- ❌ 项目需新增 `src-tauri/` 目录和 Rust 代码，架构变化较大
- ❌ Tauri sidecar 的 IPC 通信需要额外配置（shell plugin 权限等）

**原生感评估**：
- 使用系统 WebView2 → 原生 Web 渲染引擎 ✅
- 自定义标题栏需要额外 CSS 工作
- 系统托盘、通知等通过插件实现 ✅
- 安装包体验接近原生应用 ✅

**适用场景**：需要轻量级桌面体验，愿意引入 Rust 工具链，追求小体积和高性能

---

### 方案 4：PyWebView

**原理**：用 pywebview 创建原生窗口（Windows 上使用 WinForms/WebView2），Python 后端在同一进程内运行。

**架构**：
```
pywebview 窗口
├── webview.create_window('Paper Reader', 'http://localhost:8000')
├── 同一 Python 进程内运行 uvicorn（需在独立线程）
└── 窗口关闭时停止 uvicorn
```

**优势**：
- ✅ 纯 Python 方案，不需要额外的 Node.js/Rust 技术栈
- ✅ 可与 PyInstaller 打包为单 exe
- ✅ 窗口使用系统原生引擎（WinForms WebView2 on Windows）
- ✅ 内置 JS↔Python 桥接 API，可直接调用后端函数
- ✅ 相对轻量

**劣势**：
- ❌ 社区较小（GitHub ~5k stars vs Electron ~110k, Tauri ~90k）
- ❌ 与 FastAPI 的集成需要在线程中跑 uvicorn，处理起来有坑
- ❌ 打包后体积问题依旧（PyInstaller + sentence-transformers）
- ❌ 调试困难（WebView 窗口内调试不如浏览器开发工具方便）
- ❌ 与 FastAPI 同时运行需要手动管理线程/事件循环
- ❌ 功能不如 Electron/Tauri 丰富（无系统托盘内置支持，需额外库）
- ❌ pywebview Windows 依赖 pythonnet + .NET 4.0 + WebView2 Runtime

**原生感评估**：
- WinForms 窗口外观不如 WebView2 原生
- 可以自定义窗口大小和标题
- 无系统托盘内置 API

**适用场景**：纯 Python 开发者，不想引入其他语言栈，需要简单的原生窗口

---

## 综合对比表

| 维度 | 方案1: PyInstaller+bat | 方案2: Electron | 方案3: Tauri | 方案4: PyWebView |
|------|------------------------|-----------------|---------------|------------------|
| **打包难度** | ⭐ 低 | ⭐⭐⭐ 高 | ⭐⭐ 中 | ⭐⭐ 中 |
| **原生感** | ❌ 浏览器窗口 | ✅ 完全原生 | ✅ 接近原生 | ✅ 基本原生 |
| **后端管理** | ⭐ 简单脚本 | ⭐⭐ 子进程 | ⭐⭐ sidecar机制 | ⭐⭐ 线程管理 |
| **构建复杂度** | ⭐ 极低 | ⭐⭐⭐ 高 | ⭐⭐ 中 | ⭐⭐ 中 |
| **自动更新** | ❌ 无 | ✅ electron-updater | ✅ tauri-updater | ❌ 无内置 |
| **分发大小** | 1-2GB+ (PyTorch) | 1.2-2GB+ | 1-2GB+ | 1-2GB+ |
| **社区成熟度** | ✅ 成熟 | ✅ 最成熟 | ✅ v2成熟 | ⚠️ 较小 |
| **内存占用** | 低 | 高 | 低 | 中 |
| **系统托盘** | 需额外实现 | ✅ 内置 | ✅ 插件 | ❌ 需额外库 |
| **Win7支持** | ✅ | ✅ | ❌ (需WebView2) | ⚠️ (需WebView2) |
| **架构改动** | 极小 | 大 | 中 | 小 |
| **技术栈新增** | 无 | Node.js+ELECTRON | Rust+Tauri | pywebview |

> 注：所有方案的分发大小都受 sentence-transformers 及其 PyTorch 依赖影响。如果考虑仅打包 Python 运行时不含 ML 模型（模型首次运行时下载），则：
> - 方案 1: ~100-200MB
> - 方案 2: ~300-400MB (+Chromium)
> - 方案 3: ~110-210MB (+WebView2)
> - 方案 4: ~100-200MB

---

## 推荐

### 对于当前 PRD（"双击快捷方式一键启动"，无系统托盘需求）

**推荐方案 1（PyInstaller + 批处理/启动脚本）**，原因：

1. PRD 的 Out of Scope 明确排除了系统托盘图标和自动更新
2. PRD 假设用户仍需预装 Python + Node.js（后调整为"前端 build 后由后端托管"更简单）
3. 改动最小：只需加一个启动脚本 + 让 FastAPI 托管前端静态文件
4. 实际路径应该是：
   - 前端 `npm run build` → `frontend/dist/`
   - FastAPI 挂载 `frontend/dist/` 为静态文件（由 index.html fallback）
   - 一个 `.bat`/`.vbs` 脚本：启动 uvicorn → 等待 health → 打开浏览器
   - 创建桌面快捷方式指向该脚本

### 未来升级路径

如果后续需要更原生的体验（系统托盘、自定义窗口栏），可以平滑升级到：
- 方案 1 → 方案 3（Tauri sidecar）：Python 后端打包为 exe，Tauri 提供原生窗口壳
- 方案 1 → 方案 2（Electron）：类似但更重

### sentence-transformers 打包问题

**建议的务实策略**：
- 打包时排除 `sentence_transformers` 及 `torch`（占体积大头 1.5GB+）
- 首次使用 embedding 功能时在线下载模型
- 这样可将打包体积控制在 ~200MB 以内
- 或更简单：桌面版继续要求用户有 Python 环境，仅做"启动脚本"而非真正的 exe 打包

---

## 相关项目代码位置

| 文件 | 需改动 | 说明 |
|------|--------|------|
| `backend/app/main.py` | ✅ | 添加前端静态文件托管（mount dist/） |
| `backend/app/core/config.py` | ✅ | `.env` 路径适配打包 后环境 |
| `.env.example` | ⚠️ | CORS origins 和 VITE_API_BASE 需调整 |
| `frontend/vite.config.ts` | ⚠️ | 可能需要调整 build 输出路径 |

## Caveats / Not Found

- 未能确认 PyInstaller 打包含 uvicorn + fastapi + sqlmodel 的实际兼容性细节（需实际测试）
- sentence-transformers + torch 的 PyInstaller 打包可能有隐藏依赖（如 CUDA runtime），需实际测试
- WebView2 在不同 Windows 版本的预装情况不同（Win10 20H2+, Win11 默认有；更旧版本需用户安装）
- 项目当前 `.env` 路径使用 `Path(__file__).resolve().parents[2]`，打包后 `__file__` 指向冻结目录，路径会变