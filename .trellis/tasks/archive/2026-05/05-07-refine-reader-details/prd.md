# 阅读器精修 — 状态栏、模式切换、PDF沉浸感、Markdown居中、抽屉入口

## 目标

在当前阅读器结构上做细节打磨，不改功能逻辑，只优化布局、状态展示和样式。

## 当前已知

| 文件 | 角色 |
|------|------|
| `ReaderToolbar.tsx` | 两行轻量顶部：模式+状态条。`autoSaved` 初始 false → 显示"保存中…" |
| `ReaderShell.tsx` | 布局：Toolbar + primary-pane(full) + drawer-toggle + RightDrawer |
| `ReaderPage.tsx` | 状态管理：drawer/autoSave/debounce |
| `PdfReaderPane.tsx` | iframe 嵌 PDF，`.reader-pdf-iframe` 弹性占满 |
| `MarkdownReaderPane.tsx` | TOC(左) + body(右) grid，`.reader-markdown-body` max-width:920px |
| `Drawer.tsx` | 通用 drawer，fixed + translateX |
| `RightDrawer.tsx` | 三 Tab: 概览/结构块/笔记 |
| `index.css` | 所有 reader/drawer CSS |

## 需求

### 1. 状态栏修复 — "保存中…" → "已自动保存"

**问题**: `autoSaved` 初始 `false`，页面刚载入时状态栏长期显示"保存中…"

**修复**:
- `autoSaved` 初始值改为 `true`（已存状态）
- 仅在检测到状态/进度变更、等待 debounce + 保存时才设为 `false`
- 显示文案: `已自动保存`（默认） / `正在保存…`（仅短暂过渡中）
- 状态条字号、颜色保持弱化

### 2. 分段控件精修

**当前**: 已有 `.reader-mode-segmented` + `.segmented-btn`，活跃按钮蓝色填充
**精修**:
- 活跃状态更明显: 蓝色背景 + 白色文字 + 轻微内阴影
- 非活跃: 更弱化
- 控件整体更紧凑

### 3. PDF 模式沉浸感增强

**问题**: PDF 左右深色空白偏大
**修复**:
- `.reader-pdf-pane` padding 减小或移除
- PDF iframe 添加 `#pagemode=none` 尝试隐藏浏览器内置侧栏
- iframe 背景更深，减少与浏览器工具栏的割裂
- 主阅读区尽量占满

### 4. 自定义滚动条暗色化

**修复**: 在 `:root[data-theme="dark"]` 添加 `scrollbar-color` 和 `::-webkit-scrollbar` 样式

### 5. AI 辅助抽屉入口优化

**当前**: "AI 辅助" 按钮，静态文字
**修复**:
- 收起时: `AI 辅助 ▸`（向右箭头暗示可展开面板）
- 展开时: `收起 ▾`
- 按钮样式略突出，像"开关"

### 6. Markdown 模式正文居中

**问题**: 正文偏左，右侧空白大
**修复**:
- `.reader-markdown-body` 添加 `margin: 0 auto` 自动居中
- `.reader-markdown-pane` 的 grid 第二列设为 `justify-self: center` 或 body 自身居中
- max-width 改为 860px

### 7. 整体视觉统一

- 顶部工具栏压缩高度
- 各元素间距微调
- 减少不必要的边框

## 验收标准

- [ ] 初始加载时状态栏显示"已自动保存"，不显示"保存中…"
- [ ] 触发保存时才短暂显示"正在保存…"，完成后恢复"已自动保存"
- [ ] 分段控件 PDF/Markdown 高亮明确
- [ ] PDF 阅读区占更大比例
- [ ] 暗色滚动条（webkit + firefox）
- [ ] AI 辅助入口收起时显示"AI 辅助 ▸"，展开时显示"收起 ▾"
- [ ] Markdown 正文居中，max-width 860px
- [ ] `npm run build` / `npx vitest run` 通过

## 范围外

- PDF.js 集成
- 左侧缩略图栏实现
- API/业务逻辑改动
- 后端变更

## 文件变更

| 文件 | 变更 |
|------|------|
| `ReaderPage.tsx` | `autoSaved` 初始 true，delta 检测后设 false |
| `ReaderToolbar.tsx` | 文案微调 `autoSaved ? '已自动保存' : '正在保存…'` |
| `ReaderShell.tsx` | drawer toggle 文案根据状态切换 |
| `PdfReaderPane.tsx` | pdfUrl 添加 `#pagemode=none` |
| `index.css` | scrollbar 暗色、segmented 精修、markdown 居中、padding 微调 |
