# 工作看板 UI 优化

## 需求

### 1. 今日概览横向布局
在工作看板的今日概览区域，将 日期、订阅源、论文候选、相关项目 四个指标横向排成一行（4列），替换当前日期在上方、其余三个指标在下方分离显示的布局。

### 2. 文档目录标题截断
左侧文档目录中，当标题字数过多时防止被下一个标题覆盖，添加文本截断（ellipsis）和断词处理。

## 改动范围
- `frontend/src/components/DailyBriefingShell.tsx` — 在 metrics 中添加日期指标
- `frontend/src/index.css` — 修改 `.briefing-hero-metrics` 为4列，修复 `.briefing-document-outline a` 文本溢出
