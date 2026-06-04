# Paper Reader Helper

AI 驱动的学术论文管理与阅读辅助平台。支持论文导入、智能解析、结构化阅读、AI 对话、每日简报和个性化推荐。

## 功能特性

- **论文库管理** — 导入、分类、标签、筛选、批量操作
- **结构化阅读器** — PDF + Markdown 双窗格阅读，段落级翻译与笔记
- **AI 研究助手** — 对话式论文解读与研究分析
- **每日简报** — AI 自动生成论文推荐报告与项目追踪
- **智能推荐** — 基于论文库和研究方向的个性化推荐
- **工作看板** — KPI 卡片、阅读进度、优先论文、周报图表
- **学术追踪** — 阅读趋势、导入趋势、来源分布、主题分布
- **AI Agent** — 自动整理论文库（分类、标签、批量操作），支持审批与回滚
- **多源导入** — 支持 arXiv、Semantic Scholar、OpenAlex、CrossRef、DBLP 等 12+ 学术数据源
- **Zotero 集成** — 从 Zotero 文库安全导入论文，支持预览和去重
- **订阅管理** — 订阅 arXiv 查询和 RSS 源，持续自动导入新论文

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| 后端 | FastAPI + SQLModel + SQLite |
| AI | DeepSeek API（摘要/对话/推荐）+ MinerU API（PDF 解析）+ BGE-M3（本地向量嵌入） |
| 部署 | Docker Compose / 桌面模式（后端托管前端静态文件） |

## 快速开始

### 环境要求

- Node.js >= 18
- Python >= 3.12
- [uv](https://docs.astral.sh/uv/)（Python 包管理）

### 1. 克隆项目

```bash
git clone https://github.com/xdexcellent/paper-reader-helper.git
cd paper-reader-helper
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入必要的 API 密钥：

| 变量 | 说明 | 必填 |
|---|---|---|
| `MINERU_API_TOKEN` | MinerU PDF 解析 API Token | 是 |
| `DEEPSEEK_API_KEY` | DeepSeek AI API Key | 是 |
| `APP_PASSWORD` | 应用访问密码（留空则不启用） | 否 |
| `JWT_SECRET` | JWT 签名密钥 | 是 |

### 3. 启动后端

```bash
cd backend
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

浏览器访问 `http://localhost:3000`。

## 其他运行方式

### Docker Compose

```bash
docker compose up
```

- 后端：`http://localhost:8000`
- 前端：`http://localhost:3000`

### 桌面模式（一键启动）

```bash
cd frontend && npm run build
cd .. && start.bat
```

后端托管前端静态文件，浏览器自动打开 `http://localhost:8000`。详见 [DESKTOP.md](DESKTOP.md)。

## 项目结构

```
paper-reader-helper/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # 14 个 API 路由模块
│   │   ├── core/             # 配置、认证、数据库初始化
│   │   ├── models/           # 21 个 SQLModel 数据模型
│   │   ├── schemas/          # Pydantic 请求/响应模式
│   │   ├── services/         # 25+ 个业务服务
│   │   │   ├── pipeline.py              # 论文处理流水线
│   │   │   ├── deepseek_client.py       # DeepSeek AI 客户端
│   │   │   ├── embedding_service.py     # BGE-M3 向量嵌入
│   │   │   ├── source_adapters/         # 12 个数据源适配器
│   │   │   └── ...
│   │   └── main.py           # FastAPI 应用入口
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/       # 42+ 个组件
│   │   │   ├── dashboard/    # 工作看板
│   │   │   ├── library/      # 论文库管理
│   │   │   ├── reader/       # 论文阅读器
│   │   │   ├── tracking/     # 学术追踪
│   │   │   ├── agent/        # AI Agent
│   │   │   ├── zotero/       # Zotero 导入
│   │   │   └── ui/           # shadcn/ui 基础组件
│   │   ├── lib/              # API 客户端与工具
│   │   └── types.ts          # TypeScript 类型定义
│   └── package.json
├── docker-compose.yml
├── start.bat                 # 桌面模式一键启动
└── .env.example
```

## 论文处理流水线

论文导入后自动经过以下处理：

1. **PDF 解析** — MinerU API 将 PDF 转为结构化 Markdown
2. **AI 摘要** — DeepSeek 生成一行摘要、核心贡献、方法概述
3. **段落提取** — 提取文档结构化段落块
4. **段落翻译** — 按需翻译段落
5. **向量嵌入** — BGE-M3 本地生成嵌入向量，支持语义搜索
6. **自动分类** — AI 自动分类论文到研究类别

## 支持的学术数据源

arXiv · CrossRef · DBLP · GitHub Trending · Hugging Face Papers · OpenAlex · OpenReview · Papers With Code · RSS · Semantic Scholar · Unpaywall

## 开发

```bash
# 前端测试
cd frontend && npm run test

# 前端构建
cd frontend && npm run build

# 后端测试
cd backend && uv run pytest
```

## 相关文档

- [DESKTOP.md](DESKTOP.md) — 桌面应用构建与打包指南
- [DESIGN.md](DESIGN.md) — UI 设计系统文档（Apple 风格）

## License

MIT
