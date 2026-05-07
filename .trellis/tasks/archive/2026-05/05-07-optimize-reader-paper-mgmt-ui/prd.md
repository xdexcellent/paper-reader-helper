# 优化阅读器与论文管理页UI — PDF沉浸式阅读+抽屉式侧栏+筛选区重排

## 目标

将阅读器做成"PDF 优先的沉浸式阅读体验 + 可展开 AI 辅助抽屉"，同时把论文管理页的筛选区做成"清晰、紧凑、专业的筛选工具条"。

## 当前代码基础

| 文件 | 职责 |
|------|------|
| `frontend/src/components/reader/ReaderShell.tsx` | 阅读器布局外壳：Toolbar + 左右分栏 Grid |
| `frontend/src/components/reader/ReaderToolbar.tsx` | 顶部工具栏：返回/标题/模式切换/阅读状态表单 |
| `frontend/src/components/reader/ReaderPage.tsx` | 阅读器页面容器：状态管理 |
| `frontend/src/components/reader/PdfReaderPane.tsx` | PDF 阅读面板（iframe） |
| `frontend/src/components/reader/MarkdownReaderPane.tsx` | Markdown 阅读面板（带目录） |
| `frontend/src/components/reader/ReaderBlocksPanel.tsx` | 结构化块面板 |
| `frontend/src/components/reader/ReaderNotesPanel.tsx` | 笔记编辑器 |
| `frontend/src/components/library/PaperOverviewPanel.tsx` | 论文概览面板（当前双列布局） |
| `frontend/src/components/library/PaperLibraryList.tsx` | 论文列表 + 筛选区 |
| `frontend/src/components/library/LibraryWorkspaceLayout.tsx` | 管理页主布局 |
| `frontend/src/index.css` | 全局 CSS（6336 行，CSS Variables 主题） |

**技术栈**: React 18 + TypeScript + Vite + 纯手写 CSS（无组件库/无Tailwind）
**CSS 变量**: 暗色主题 `data-theme="dark"`，主色 `--accent-blue: #0071e3`

## 需求

### A. 阅读器顶部优化

**现状问题**: 顶部太重，阅读状态/进度表单像后台管理，占用整行高度。

**要求**:
1. 第一行: `[返回论文库] 论文标题                                            [Markdown] [PDF] [更多]`
2. 第二行（轻量状态条）: `阅读中 · 进度 4% · 已自动保存`
3. PDF/Markdown 改成**分段控件**样式，当前模式高亮明显
4. 阅读状态和进度轻量化，去掉大表单
5. "保存阅读状态"改为**自动保存**（状态或进度变化时 debounce 保存，去掉大按钮）
6. 顶部整体高度压缩，给正文更多空间

### B. PDF 阅读模式优化（最主要）

**现状问题**: 右侧栏固定占宽压缩 PDF 区域，阅读区被切碎，管理页感强。

**要求**:
1. PDF 阅读区成为页面视觉主角，`iframe` 撑满可用空间
2. 右侧辅助栏改成**可展开抽屉（drawer）**
3. 默认抽屉收起，只显示入口按钮（如 `[AI 辅助]`）
4. 点击后从右侧滑出，可再次收起
5. 抽屉宽度 320–420px
6. 抽屉内内容独立滚动
7. 抽屉不要影响 PDF 主阅读区沉浸感
8. 左侧缩略图栏暂不实现（MVP 外）

### C. 右侧抽屉设计

**内容以 Tab 组织**:
- Tab 1: **论文概览** — PaperOverviewPanel（改为单列布局）
- Tab 2: **结构块** — ReaderBlocksPanel
- Tab 3: **笔记** — ReaderNotesPanel

**抽屉交互**:
- 默认收起，入口按钮在右上角
- 点击展开，CSS transition 滑出（`transform: translateX` 或 `right` 动画）
- 再次点击收起
- 遮罩层可选（桌面端非必须）

**论文概览内部优化**:
- 改为单列布局（当前 `.paper-overview-grid` 是 2 列 `grid-template-columns: repeat(2, 1fr)`）
- 抽屉内不再用双列卡片，改为单列小节
- 内容: 简要结论、核心贡献、方法概述、应用场景、局限性、相关说明

### D. Markdown 模式优化

**目标**: 结构化精读，与 PDF 的沉浸式有差异。

**要求**:
1. 左侧目录保留，层级清楚（h1>h2>h3 缩进，h4+ 可折叠）
2. 当前阅读章节高亮
3. 正文最大宽度 760–900px
4. 右侧辅助区同样用可展开抽屉
5. Markdown 模式右侧抽屉内容与 PDF 模式相同（概览/结构块/笔记）

### E. Markdown 模式目录优化

**现状**: 目录已有基础层级缩进（level-2/3/4+），缺少：
- 当前章节高亮（scroll spy 或 inactive 状态区分）
- 三级及以下可折叠（可选，MVP 保留现有风格）

### F. 论文管理页筛选区重排

**现状问题**:
- `.paper-library-controls` 使用 `grid-template-columns: minmax(0, 1fr) 150px 132px 140px`
- 搜索框和三个下拉筛选器挤在一行，label+select 纵向排列
- 文字可能被挤断换行，分组关系不清晰
- 与下方标签筛选关系混乱

**要求**:
1. **第一层: 搜索** — 搜索框独立一行 `[搜索论文标题 / 作者 / 关键词]`
2. **第二层: 核心筛选** — 三个筛选器横向排列: `状态：[全部状态 ▼]  收藏：[全部论文 ▼]  阅读：[全部状态 ▼]`
3. **第三层: 标签筛选** — 标签 pill 按钮（保持现有 `.tag-filter-bar`）
4. 搜索和筛选分开，不混在一组
5. 三组筛选器用 "标签 + 下拉框" 单行形式（label 左，select 右，或 label 上 select 下保持宽裕）
6. Label 文字不允许断裂
7. 每组筛选器最小宽度足够
8. 三组之间间距稳定

### G. 视觉风格

整体保持深色科技风，但更克制、专业：
- 主色 `--accent-blue: #0071e3`
- PDF 模式强调沉浸感
- 抽屉轻量、顺滑
- 减少不必要的线框和边框
- 用背景层次、间距和轻边框区分区域
- 控制高饱和颜色数量

## 验收标准

- [ ] PDF 模式下右侧抽屉默认收起，点击入口按钮可展开/收起
- [ ] 抽屉展开时带平滑动画（transition）
- [ ] 抽屉内容三个 Tab 可切换：论文概览 / 结构块 / 笔记
- [ ] 论文概览在抽屉内为单列布局
- [ ] Markdown 模式同样使用抽屉式右侧栏
- [ ] 顶部工具栏压缩为一窄行 + 轻量状态条
- [ ] PDF/Markdown 切换使用分段控件样式
- [ ] 阅读状态自动保存（debounce），无需手动点击按钮
- [ ] PDF 阅读区撑满可用空间，iframe 不被挤压
- [ ] 论文管理页筛选区改为三层结构（搜索 → 核心筛选 → 标签）
- [ ] 三组核心筛选器横向排列，文字不换行
- [ ] `npm run build` / lint 通过

## 决策 (ADR-lite)

### 状态栏页码显示策略
- **决策**: 条件展示。因当前项目未接入 PDF.js，只能可靠获取 `reading_progress` 百分比
- **当前实现**: `阅读中 · 进度 4% · 已自动保存`
- **后续**: 接入 PDF.js 后可升级为 `阅读中 · 第 X / Y 页 · 进度 N% · 已自动保存`
- **不做**: 手动页码输入（增加用户负担，不准确）

### 自动保存策略
- 阅读状态/进度变化时 debounce 500ms 后自动调用 API
- 保存成功后显示 "已自动保存" 状态
- 去掉手动"保存阅读状态"大按钮

## 范围外

- 左侧 PDF 缩略图栏（此迭代不实现）
- PDF.js 集成（此迭代不实现，后续可升级页码显示）
- 手动页码输入
- 手机端触屏手势优化（保持现有响应式即可）
- 主题切换功能改动
- 后端 API 变更

## 技术方案

### 抽屉组件（新增）

新建 `frontend/src/components/Drawer.tsx`:
- `isOpen` / `onClose` / `width` / `children` props
- CSS: `position: fixed; top: 0; right: 0; height: 100vh; transform: translateX(100%) → translateX(0)`
- Transition: `transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- 复用项目 CSS 变量

### ReaderShell 改动

- 移除固定的 `reader-shell-grid` 双栏布局
- `reader-primary-pane` 改为 `flex: 1` 撑满
- 抽屉入口按钮放在右上角
- Reading state form 移除，Toolbar 改为轻量 Header

### ReaderToolbar 改动

- 移除 `reader-state-form`（阅读状态表单）
- 改为两行轻量结构
- 阅读状态变化时直接 debounce 调用 API（在 ReaderPage 中处理）

### PaperLibraryList 改动

- `.paper-library-controls` 拆分：
  - 第一行: 搜索框（独立 label+input）
  - 第二行: 三个 filter select 横向排列
- `.tag-filter-bar` 保持现有逻辑

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `frontend/src/components/Drawer.tsx` | **新增** 抽屉组件 |
| `frontend/src/components/reader/ReaderShell.tsx` | 重写布局：移除固定侧栏 → 抽屉入口 + 条件渲染 |
| `frontend/src/components/reader/ReaderToolbar.tsx` | 轻量化：移除阅读状态表单 → 两行轻量 header |
| `frontend/src/components/reader/ReaderPage.tsx` | 添加 auto-save debounce、drawer 状态管理 |
| `frontend/src/components/reader/PdfReaderPane.tsx` | 微调：移除固定高度限制 |
| `frontend/src/components/library/PaperOverviewPanel.tsx` | 添加 `singleColumn` prop，支持单列模式 |
| `frontend/src/components/library/PaperLibraryList.tsx` | 筛选区重排：三层结构 |
| `frontend/src/index.css` | 新增 drawer、更新 reader、更新筛选区样式 |
