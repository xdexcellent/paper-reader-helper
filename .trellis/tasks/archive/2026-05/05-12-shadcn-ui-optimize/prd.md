# shadcn/ui 组件优化前端页面

## Goal

用 shadcn/ui 官方组件替换当前项目中的手工 CSS 组件和样式，提升 UI 一致性、可维护性和开发效率，同时保留现有暗色/亮色主题和品牌视觉。

## What I already know

- 前端技术栈：React 18 + TypeScript + Vite + react-router-dom
- **无 Tailwind CSS、无 shadcn/ui** — 纯手写 CSS (~9600 行 index.css)
- 自有主题系统：CSS 变量 (`--bg-page`, `--text-primary`, `--accent-blue` 等) 支持暗色/亮色切换
- ~60+ 自定义组件，核心页面：工作看板(Briefing)、AI助手、学术追踪(Stats)、论文库(Library)、阅读器(Reader)、Zotero导入、订阅管理、登录
- 已安装 Vercel agent skills：`vercel-composition-patterns`、`vercel-react-best-practices`、`web-design-guidelines`、`deploy-to-vercel` 等
- shadcn/ui 需要 Tailwind CSS 作为底层

## Assumptions (temporary)

- 引入 shadcn/ui 需要先安装 Tailwind CSS v4 + 配置 PostCSS
- 现有 CSS 变量主题系统可以映射到 Tailwind CSS 变量（shadcn/ui 也使用 CSS 变量）
- 组件迁移可以分阶段进行，不需要一次性全部重写
- 现有路由和状态管理不变

## Open Questions

(已全部解决)

## Decisions

- **迁移策略**：渐进式 — 先试点 Library + Briefing 页面，验证后再铺开其余页面
- **试点页面**：论文库 Library + 工作看板 Briefing（覆盖复杂交互和核心布局）
- **CSS 策略**：Tailwind 优先 + 保留关键自定义 CSS（毛玻璃/渐变用 CSS 变量 + Tailwind arbitrary values）
- **视觉效果**：保留并增强现有毛玻璃+渐变光晕效果，与 shadcn/ui 组件风格融合

## Requirements (evolving)

- 安装 Tailwind CSS v4 + shadcn/ui 初始化（含主题映射到现有 CSS 变量）
- 迁移 **Library 页面** 组件到 shadcn/ui（列表、分类、标签、导入弹窗、详情面板）
- 迁移 **Briefing 页面** 组件到 shadcn/ui（侧栏、卡片、Tab、日期选择等）
- 保留暗色/亮色主题切换功能
- 保持现有路由和 API 调用不变
- 其余页面本期不动，但架构需可扩展

## Acceptance Criteria (evolving)

- [ ] Tailwind CSS + shadcn/ui 成功安装并可运行
- [ ] 迁移的页面视觉与修改前对齐（或改进）
- [ ] 暗色/亮色主题切换正常
- [ ] 项目 lint + typecheck 通过

## Definition of Done (team quality bar)

- Lint / typecheck / build 通过
- 迁移页面功能无回归
- 视觉效果经用户确认满意

## Out of Scope (explicit)

- 非试点页面（Stats、AI助手、Reader、Zotero、订阅管理、登录）本期不迁移
- 全局侧栏/主题切换组件的 shadcn 重制（本次仅改涉及的共享部分）
- 后端 API 变更

## Technical Approach

1. **基础设施**：安装 Tailwind CSS v4 + PostCSS + shadcn/ui CLI 初始化
2. **主题映射**：将现有 `:root[data-theme]` CSS 变量映射到 shadcn/ui 的 CSS 变量体系，保留毛玻璃/渐变光晕自定义类
3. **Library 迁移**：用 shadcn/ui 组件（Button, Card, Dialog, Table, Badge, ScrollArea 等）替换 Library 页面相关组件的手写 CSS
4. **Briefing 迁移**：用 shadcn/ui 组件（Card, Tabs, Calendar, ScrollArea, Sidebar 等）替换 Briefing 页面相关组件的手写 CSS
5. **共享组件适配**：迁移过程中涉及的共享组件（UiIcon、StatusBadge 等共用部分）做适配性修改

## Implementation Plan (small PRs)

1. **PR1: 基础设施** — 安装 Tailwind v4 + PostCSS + shadcn/ui init + 主题变量映射
2. **PR2: Library 页面迁移** — 迁移 Library 相关组件到 shadcn/ui
3. **PR3: Briefing 页面迁移** — 迁移 Briefing 相关组件到 shadcn/ui
4. **PR4: 清理 + 验证** — 移除废弃 CSS、typecheck/lint/build 验证

## Technical Notes

- 当前 `index.css` 约 9600 行，逐步迁移策略更安全
- shadcn/ui 使用 CSS 变量做主题，与现有 `:root[data-theme]` 模式兼容
- Vite 项目，shadcn/ui CLI 支持 `npx shadcn@latest init`
- 已有 Vercel composition patterns / React best practices skills 可辅助组件设计