# 优化论文管理页面 UI — 信息架构、布局、按钮层级、中文统一、暗色层级重建

## Goal

将 /papers 论文管理页面从"杂乱的论文数据维护后台"重构为"清晰、专业、高效的论文管理工作台"。从信息架构、布局比例、按钮层级、中文统一、暗色层级五个维度全面优化。

## What I already know

**核心文件 (22个源文件，不含测试)**:
- `LibraryPage.tsx` (294行) — 主页面状态管理中心
- `LibraryPageHeader.tsx` (10行) — 英文页头 "Paper library"
- `LibraryWorkspaceLayout.tsx` (208行) — 主布局: sidebar(260px) + main
- `LibrarySidebar.tsx` (85行) — 分类导航
- `LibraryToolbar.tsx` (90行) — 顶部工具栏
- `PaperLibraryList.tsx` (258行) — 论文列表 + 筛选
- `LibraryDetailStack.tsx` (87行) — 右侧详情栈容器
- `PaperMetadataPanel.tsx` (291行) — **最大问题**: 裸表单式元数据面板
- `PaperOverviewPanel.tsx` (57行) — 论文概览面板
- `LibraryImportModal.tsx` (25行) + `ImportConfirmDialog.tsx` (220行) — 导入流程
- `PaperTagEditor.tsx` (83行) — 标签编辑
- `CategoryCreateForm.tsx` (31行) — 创建分类
- `PaperActions.tsx` (112行) — 操作栏(解析/摘要/向量化)
- `FeedbackBanner.tsx` (29行) — 反馈横幅
- `libraryMetadataActions.ts` (78行) — 元数据操作消息(英文)
- `libraryFilters.ts` (96行) + `libraryBulkActions.ts` (12行) — 过滤/批量逻辑
- `libraryTypes.ts` (33行) — 类型定义

**路由**: `App.tsx` 中 `"/"` 和 `"/paper/:paperId"` 都指向 `LibraryPage`

**CSS**: `index.css` 中约 1500 行 library 相关规则，使用 `.library-*` / `.paper-*` 前缀

**当前状态值混乱**:
- PaperLibraryList 中阅读状态用英文标签 `Unread/Reading/Read/Skipped`
- PaperMetadataPanel 中同样状态用中文 `未读/阅读中/已读/已跳过`
- StatusBadge 映射不完整: `parsed`, `ready`, `imported` 原样显示英文
- 筛选选项混合中英文: `全部状态` + `Pending`

## Requirements

### 1. 页面命名统一
- 页面主标题从 "Paper library" 改为 "论文管理"
- 页面说明从 "Confirm imports, scan papers..." 改为中文
- 左上角产品名从 "论文阅读器" 相关改为匹配
- 侧边栏高亮 "论文管理" 保持

### 2. 中文化 (全面统一界面文案)
**需翻译的英文文案** (完整清单见 Technical Notes):

顶部统计: `N papers`→`N 篇论文`, `N pending`→`N 篇待确认`, `N parse failed`→`N 篇解析失败`
按钮: `Import PDF`→`导入 PDF`, `Create category`→`新建分类`, `Refresh`→`刷新`
状态: `READY`→`就绪`, `PARSED`→`已解析`, `Unread`→`未读`, `Reading`→`阅读中`, `Read`→`已读`
分类: `Categories`→`分类`, `Category scope`→`分类范围`, `All categories`→`全部分类`
筛选: `Status filter`→`状态筛选`, `Favorite filter`→`收藏筛选`, `Reading filter`→`阅读筛选`
操作: `Parse`→`解析`, `Generate summary`→`生成摘要`, `Vectorize`→`向量化`, `Open reader`→`打开阅读器`
反馈消息: 所有 `Metadata updated`→`元数据已更新` 等

**保留英文**: 论文标题、模型名(gpt-5.4)、来源名(hf_papers)、DOI、URL

### 3. 顶部工具栏重构
从松散英文标题改为紧凑中文工具栏:

```
论文管理
集中处理论文导入、分类确认、解析状态、摘要生成、向量化与阅读状态。

66 篇论文 · 12 篇待确认 · 1 篇解析失败
[导入 PDF] [新建分类] [刷新]         [更多操作 ▾]
```

要求:
- "导入 PDF" 是页面主按钮(蓝青色)
- "新建分类""刷新"是次级按钮
- "重试解析失败""删除失败记录"移入"更多操作"下拉菜单
- 危险操作(红色)不常驻顶部

### 4. 左侧分类栏优化
- 标题从 "Categories" 改为 "分类"
- 分类范围下拉: `All categories`→`全部分类`, `System`→`系统分类`, `Custom`→`自定义`, `Pending`→`待确认`
- 不再每个分类都显示 "0 pending"——只有存在待处理项时才显示数量
- 当前分类高亮更清楚(蓝青色左边框+背景)
- 增加折叠/展开功能
- 数字弱化为小号 muted

### 5. 中间论文列表优化
论文卡片重构为"处理队列"样式:
```
Awaking Spatial Intelligence in Unified Multimodal...
hf_papers · 大语言模型 · 未读                    [★]
解析完成 · 摘要完成 · 向量等待中
扩散与生成 · 多模态 · 计算机视觉
```

要求:
- 状态中文化: `READY`→`就绪`, `PARSED`→`已解析`, `Unread`→`未读`
- 处理状态用轻量 Badge 小圆点+文字
- 标题最多 2-3 行截断
- 标签最多 3 个，超出显示 `+N`
- 当前选中卡片: 蓝青色弱背景 + 清晰边框
- 筛选区和处理按钮分开

**筛选区重构**:
```
状态：[全部] [待确认] [解析失败] [就绪]
阅读：[全部] [未读] [阅读中] [已读]
收藏：[全部] [已收藏]
```

筛选条轻量化，处理按钮只针对当前选中论文

### 6. 右侧详情区重构 (最大改动)
从"裸表单"改为"分组式论文详情与处理面板":

```
┌─────────────────────────────────┐
│ 论文标题 (完整)                  │
│ hf_papers · 大语言模型 · 未读    │
│ 就绪 · 已解析 · 已摘要 · 待向量化  │
│ [打开阅读器] [★收藏]              │ ← 主操作
│ [解析] [生成摘要] [向量化]        │ ← 处理操作行
├─────────────────────────────────┤
│ ▸ 摘要                           │
│ 如有摘要内容在此...               │
│ [生成摘要] (无摘要时显示)          │
├─────────────────────────────────┤
│ ▸ 处理流程                       │
│ 导入 → 解析 ✓ → 摘要 ✓ → 向量 ⌛  │
├─────────────────────────────────┤
│ ▸ 基础信息 (编辑元数据)           │ ← 默认折叠
│ 标题 / 作者 / 年份 / 期刊 / DOI   │
├─────────────────────────────────┤
│ ▸ 分类与匹配                     │
│ 主分类 · 标签 · 置信度 · 匹配依据  │
├─────────────────────────────────┤
│ ▸ 阅读管理                       │
│ 阅读状态 · 进度 · 笔记            │
│ [保存阅读状态]                    │
└─────────────────────────────────┘
```

要求:
- 使用 `<details>/<summary>` 实现折叠分组
- 元数据编辑默认折叠，不压过摘要和阅读操作
- "打开阅读器"是详情区主按钮(蓝青色)
- 每种保存按钮只靠近对应分组
- 状态展示用 Badge 或流程条，不用输入框式容器

### 7. 按钮层级重定义

| 层级 | 按钮 | 样式 |
|------|------|------|
| **页面主按钮** | 导入 PDF | 蓝青色填充 |
| **论文主按钮** | 打开阅读器 | 蓝青色填充 |
| **论文次级操作** | 解析、生成摘要、向量化、收藏 | 深色描边/弱背景 |
| **保存操作** | 保存元数据、保存阅读状态 | 弱背景+细边框 |
| **低频操作** | 新建分类、刷新、更多操作 | 描边/淡色 |
| **危险操作** | 删除论文、删除失败记录 | 红色描边/淡红背景 |

### 8. 暗色背景层级和色彩系统
保持与工作看板一致的暗色变量层级 (`--bg-page: #0a0e14` → `--bg-panel: #10141c` → `--bg-layer-1: #161b24` → `--bg-layer-2: #1c2230`)

色彩规则:
- 蓝青色: 主操作、当前选中、主高亮
- 绿色: 完成状态
- 橙色: 待处理/待确认
- 红色: 失败/删除/危险操作
- 灰蓝色: 普通标签、辅助信息

### 9. 滚动和空间要求
- 顶部工具栏固定(sticky)
- 分类栏独立滚动
- 论文列表独立滚动
- 右侧详情区独立滚动
- 使用轻量滚动条样式

## Technical Approach

### 涉及文件 (按改动程度)
**重度改动** (JSX + CSS 都改):
- `LibraryPageHeader.tsx` — 中文化页头
- `LibraryToolbar.tsx` — 紧凑工具栏，增加"更多操作"下拉
- `PaperMetadataPanel.tsx` — 改为分组式详情面板
- `PaperLibraryList.tsx` — 中文化筛选+列表卡片重构
- `LibrarySidebar.tsx` — 中文化+取消冗余pending显示

**中度改动** (主要 CSS):
- `index.css` — 重建 library 相关暗色层级、卡片样式、详情区样式

**轻度改动** (文案/消息):
- `libraryMetadataActions.ts` — 反馈消息中文化
- `PaperOverviewPanel.tsx` — 中文化概览面板
- `LibraryPage.tsx` — 反馈消息中文化
- `ImportConfirmDialog.tsx` — 中文化导入流程
- `CategoryCreateForm.tsx` — 中文化表单

**不改**:
- 业务逻辑(data fetching, state management, API calls)
- 路由配置
- 类型定义(types.ts)
- 不新增第三方依赖

**注意**: StatusBadge 的 `labelMap` 需要补充 `parsed`、`ready` 等缺失映射

### 实施顺序
1. CSS 变量和基础规则调整 (index.css)
2. LibraryPageHeader 中文化
3. LibraryToolbar 重构 (紧凑布局 + 更多操作)
4. LibrarySidebar 中文化 + pending隐藏
5. PaperLibraryList 中文化筛选 + 卡片重构
6. PaperMetadataPanel 拆分为分组折叠面板 (最大改动)
7. 其他组件中文化 (导入、概览、表单、反馈消息)
8. StatusBadge 映射补充
9. 运行 typecheck + tests

## Acceptance Criteria

- [ ] 页面标题 "论文管理" / 副标题中文化
- [ ] 所有 UI 文案统一中文(论文标题/模型名/来源名/DOI/URL 除外)
- [ ] 顶部工具栏紧凑：统计行 + 主次按钮 + 更多操作
- [ ] 左侧分类栏中文、高亮清晰、不显示 0 pending
- [ ] 中间论文列表卡片像"处理队列"，状态中文化
- [ ] 筛选条和操作按钮分开
- [ ] 右侧详情区分组折叠(摘要/处理流程/基础信息/分类匹配/阅读管理)
- [ ] "打开阅读器"为详情区主按钮
- [ ] 按钮层级明确(主/次/保存/低频/危险)
- [ ] 暗色层级肉眼可辨，色彩统一
- [ ] StatusBadge 覆盖所有论文状态值的正确中文映射
- [ ] 滚动区域独立，不互相干扰
- [ ] 现有功能正常(导入/分类/筛选/删除/解析/摘要/向量化/元数据保存)
- [ ] `npm run typecheck` 通过
- [ ] tests pass

## Out of Scope

- 不修改后端 API
- 不修改数据模型
- 不大改业务逻辑
- 不新增第三方依赖
- 不修改工作看板(/briefing)、阅读器(/reader)、统计页(/stats)等

## Technical Notes

### 完整中文化清单 (按文件)

**LibraryPageHeader.tsx**: "Paper library"→"论文管理", 副标题→"集中处理论文导入、分类确认、解析状态、摘要生成、向量化与阅读状态。"

**LibrarySidebar.tsx**: "Categories"→"分类", "Category scope"→"分类范围", "All categories"→"全部分类", "System"→"系统分类", "Custom"→"自定义", "Pending"→"待确认", "pending"后缀→"篇待确认", panel-chip "Library"→"分类"

**LibraryToolbar.tsx**: "N papers"→"N 篇论文", "N pending"→"N 篇待确认", "N parse failed"→"N 篇解析失败", "Syncing"→"同步中", "Import PDF"→"导入 PDF", "Create category"→"新建分类", "Refresh"→"刷新", 新增"更多操作"下拉(含重试/删除失败)

**PaperLibraryList.tsx**: 
- 搜索 placeholder: "Search title or source"→"搜索标题或来源"
- 筛选标签: "Status filter"→"状态筛选", "Favorite filter"→"收藏筛选", "Reading filter"→"阅读筛选"
- 状态值: 中文映射表补充
- 阅读状态: "Unread"→"未读", "Reading"→"阅读中", "Read"→"已读", "Skipped"→"已跳过"
- "Favorite"→"收藏", "Pending"→"待确认"

**PaperMetadataPanel.tsx**: 空状态→"选择一篇论文查看详情和管理状态。"
- 状态显示用 Badge 替代输入框
- 删除"裸表单"布局，改用分组折叠

**PaperOverviewPanel.tsx**: "Screening"→"审阅概览", "Paper overview"→"论文概览", "Quick conclusion"→"简要结论", "Core contributions"→"核心贡献", "Method overview"→"方法概述", "Use cases"→"应用场景", "Limitations"→"局限性", "Relevance note"→"相关说明", 空状态→中文化

**ImportConfirmDialog.tsx**: "PDF import"→"PDF 导入", "Drop a PDF here"→"拖拽 PDF 到此处", "Choose a local PDF, then confirm its metadata."→"选择本地 PDF 文件并确认元数据。", "Choose PDF"→"选择 PDF", "Selected file:"→"已选文件：", "Source"→"来源", "Only PDF files are supported."→"仅支持 PDF 文件。", "Choose a PDF file before importing."→"请先选择 PDF 文件。", "Enter a title before importing."→"请先输入论文标题。", "A paper with this title already exists."→"已存在相同标题的论文。", "Cancel"→"取消", "Confirm import"→"确认导入", "Importing..."→"导入中..."

**CategoryCreateForm.tsx**: "Category name"→"分类名称", "Description"→"描述", "Save category"→"保存分类"

**libraryMetadataActions.ts**: 
- "Metadata updated"→"元数据已更新", "Failed to update metadata"→"元数据更新失败"
- "Added to favorites"→"已收藏", "Removed from favorites"→"已取消收藏", "Failed to update favorite"→"收藏更新失败"
- "Reading state updated"→"阅读状态已更新", "Failed to update reading state"→"阅读状态更新失败"
- "Notes saved"→"笔记已保存", "Failed to save notes"→"笔记保存失败"

**LibraryPage.tsx**: 
- "Failed to load paper detail"→"加载论文详情失败"
- "Import completed"→"导入完成", "Import failed"→"导入失败"
- "Primary category updated; paper moved out of the current category."→"主分类已更新；论文已从当前分类移出。"
- "Primary category updated"→"主分类已更新", "Failed to update primary category"→"主分类更新失败"
- "Task failed"→"任务失败"
- "Parse completed"→"解析完成", "Summary completed"→"摘要完成", "Embedding completed"→"向量化完成"

**StatusBadge 映射补充**: 
- 补充 `parsed`→"已解析", `ready`→"就绪", `imported`→"已导入"
- 确保所有论文处理状态有中文映射

### 关键 CSS 类结构 (待修改)
```
.library-workspace-header → 紧凑工具栏
.library-sidebar → 分类面板样式
  .library-category-item → 激活状态优化
.library-toolbar → 新工具栏布局
.library-grid → 双栏比例调整
.paper-library-item → 卡片队列样式
.paper-metadata-panel → 分组折叠面板样式
.library-control → 表单控件统一样式
```
