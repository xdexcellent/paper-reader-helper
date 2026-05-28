# 优化学术追踪前端 UI

## Goal

将“学术追踪”页面从当前基础仪表盘优化为更接近参考图的产品级 SaaS 数据看板：提高信息密度、层级感、专业感和空状态质量，同时保持现有数据接口和业务逻辑不变。

## Requirements

* 为页面增加更完整的产品壳感：参考侧边导航、顶部工具区和紧凑内容容器的视觉层级。
* 将 KPI 区域从 3 列大卡优化为 6 个紧凑统计卡，突出主数值、说明、趋势和状态图标。
* 优化“来源分布”“研究节奏”“导入趋势”“完成趋势”“主题分布”“近期处理动态”的卡片层级、标题操作、图例、空状态和视觉密度。
* 保持现有接口字段、统计计算和图表数据来源不变。
* 页面在宽屏、平板和移动端保持可读，不出现横向溢出或文字重叠。

## Acceptance Criteria

* [ ] 学术追踪页面首屏视觉更接近参考图：有 sidebar/产品壳、紧凑 KPI、清晰图表分区。
* [ ] 所有 tracking 组件在 loading、empty、normal 状态下都有稳定布局。
* [ ] 不引入新的后端接口或数据 schema 改动。
* [ ] 前端测试或构建通过；若存在与本任务无关的既有失败，需要明确说明。

## Definition of Done

* 修改集中在 `frontend/src/components/tracking/` 及必要的局部样式。
* 使用项目已有 React + CSS pattern，不引入新依赖。
* 运行定向测试/构建验证。
* 完成后做一次浏览器或 HTTP 层面的页面可访问验证。

## Technical Approach

优先采用小步局部重构：保留现有页面组件拆分和数据流，在 `AcademicTrackingPage` 中增加页面框架和布局，在 tracking 子组件内部调整卡片结构与视觉。图表仍使用现有 SVG 实现。

## Out of Scope

* 不改后端统计接口。
* 不做全站导航重构。
* 不引入 ECharts/Recharts 等新图表库。
* 不处理非学术追踪页面的视觉问题。

## Technical Notes

* 当前相关文件：`frontend/src/components/tracking/*`
* 参考图重点：左侧导航产品壳、6 个紧凑 KPI、研究节奏解释型卡片、图表标题操作、近期动态表格/空状态。
* 设计约束来自 `ui-ux-pro-max`：Data-Dense Dashboard、蓝色数据主色、轻边框、浅背景、高对比文本、稳定 hover。
