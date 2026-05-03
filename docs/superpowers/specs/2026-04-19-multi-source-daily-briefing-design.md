# 多源自动抓取与每日速览设计

## 1. 目标与范围

### 1.1 目标

在现有论文阅读器上新增一条完整的自动化主链路：

- 按配置的时间自动抓取订阅源内容
- 自动去重并导入论文
- 自动执行解析、摘要生成、自动分类
- 基于“今天新抓到且处理完成”的论文生成每日速览
- 在“工作看板”中直接展示当日速览

### 1.2 首批支持的数据源

首批落地以下 5 类源：

- `arXiv`
- `RSS`
- `OpenReview`
- `Hugging Face Papers`
- `GitHub Trending`

其中：

- 前 4 类作为“论文候选源”参与论文导入与 Top 5 排序
- `GitHub Trending` 作为“相关项目源”，单独展示在工作看板侧栏，不参与论文 Top 5 排序

### 1.3 速览口径

每日速览只看：

- “今天新抓到”的内容
- 且已完成 `导入 -> 解析 -> 摘要 -> 自动分类` 的论文

不看：

- 历史库存论文
- 今天之前抓到、今天才补处理完成的旧内容
- 未处理完成的论文

### 1.4 调度与默认配置

第一版提供全局自动化设置，并开放 UI 配置：

- 默认生成时间：`12:00`
- 默认时区：`Asia/Shanghai`
- 默认 Top N：`5`
- 默认启用自动日报

第一版不做：

- 每个订阅源单独配置不同日报时间
- 外部通知（邮件、Webhook、IM 推送）
- 多期日报自动回填
- GitHub 项目与论文混排排序

---

## 2. 现状与问题

### 2.1 已有能力

当前系统已具备以下基础能力：

- 论文导入与 PDF 存储
- `MinerU` 解析 PDF
- `DeepSeek` 生成论文摘要
- 自动分类与标签生成
- 任务队列 `BackgroundTaskQueue`
- 工作看板与 `briefing` 页面
- `arXiv` 订阅、预览、手动抓取

### 2.2 当前缺失

当前缺少以下关键能力：

- 多源统一订阅抽象
- 定时自动抓取
- “抓取记录”和“论文实体”分层
- 面向“今天抓取结果”的日报快照
- 自动化运行配置的 UI
- 工作看板对日报快照的展示，而不是全库实时拼装

### 2.3 核心问题

如果直接在现有代码上继续堆叠：

- 各源抓取逻辑会分叉成多套 `if/else`
- 无法准确追踪当天抓取了什么、失败在哪一层
- “工作看板”会继续是全库统计，而不是日报产品
- 多源去重、失败重试、历史日报都难以演进

因此需要把这次功能设计成：

- 统一数据源适配层
- 统一每日编排器
- 日报快照化
- 工作看板消费日报快照

---

## 3. 总体方案

### 3.1 推荐方案

采用“统一订阅适配层 + 每日编排任务 + 日报快照”的方案：

- 多源都接入同一套 `SourceAdapter`
- 每日由一个调度器触发一次完整编排
- 对当天抓取结果做去重、导入、处理、排序、落日报
- 前端工作看板读取日报快照展示

### 3.2 总体原则

- 先做全局自动化，再考虑订阅级高级调度
- 论文与项目分栏展示，不混口径
- 日报是快照，不是实时拼装
- 允许部分失败，避免整期日报消失
- 复用现有解析、摘要、分类链路

### 3.3 总体链路

`定时触发 -> 遍历订阅 -> 各源抓取 -> 标准化候选项 -> 去重 -> 导入 Paper -> 解析 -> 摘要 -> 自动分类 -> 筛出当日处理完成论文 -> AI 排序 Top 5 -> 生成日报快照 -> 工作看板展示`

---

## 4. 模块设计

### 4.1 Source Adapter 层

新增统一接口：

- `fetch(subscription, since, limit) -> list[SourceCandidate]`
- `fingerprint(candidate) -> SourceFingerprint`
- `resolve_primary_asset(candidate) -> SourceAsset`

职责：

- 调用不同外部源
- 把原始结果映射成统一结构
- 生成稳定的去重依据

首批实现：

- `ArxivAdapter`
- `RssAdapter`
- `OpenReviewAdapter`
- `HuggingFacePapersAdapter`
- `GithubTrendingAdapter`

### 4.2 Daily Ingestion Service

新增 `DailyIngestionService`，负责：

- 加载自动化设置
- 创建 `DailyRun`
- 获取所有启用订阅
- 调用各订阅对应 adapter 抓取
- 写入抓取记录
- 去重并导入 `Paper`
- 执行处理流水线

### 4.3 Daily Briefing Service

新增 `DailyBriefingService`，负责：

- 选出当日处理完成论文
- 调 AI 做 Top 5 排序
- 生成摘要文案与推荐理由
- 落库日报快照
- 生成“相关项目”侧栏快照

### 4.4 Automation Settings Service

新增 `AutomationSettingsService`，负责：

- 读取/保存自动化配置
- 提供 UI 配置 API
- 为调度器提供最新配置

### 4.5 Dashboard Briefing Query Service

新增专门的查询层，负责：

- 获取“今天”的日报
- 如果今天没有可用日报，则回退最近一期成功日报
- 组装工作看板展示结构

---

## 5. 数据模型设计

### 5.1 扩展 `Subscription`

现有 `Subscription` 需要扩展为多源订阅模型，新增字段：

- `source_kind`: 统一源类型，如 `arxiv` / `rss` / `openreview` / `hf_papers` / `github_trending`
- `display_name`: 用户可见名称
- `config_json`: 各源差异化配置
- `is_active`
- `last_checked_at`
- `last_success_at`
- `last_error`
- `fetch_limit`

保留字段：

- `name`
- `query`

约束：

- `query` 作为简易输入保留，复杂源以 `config_json` 为准
- 前端按 `source_kind` 渲染不同配置表单

### 5.2 新增 `AutomationSettings`

新增单行全局配置表：

- `id`
- `enabled`
- `schedule_time`
- `timezone`
- `top_n`
- `briefing_enabled`
- `project_sidebar_enabled`
- `updated_at`

设计说明：

- 第一版只保留一份全局自动化设置
- 不把调度时间塞进每个订阅，避免日报口径混乱

### 5.3 新增 `IngestionItem`

记录“抓到了什么”，不与 `Paper` 混淆：

- `id`
- `daily_run_id`
- `subscription_id`
- `source_kind`
- `artifact_type`，取值：`paper` / `project`
- `external_id`
- `canonical_url`
- `pdf_url`
- `title`
- `authors`
- `abstract_raw`
- `published_at`
- `discovered_at`
- `fingerprint`
- `status`
- `paper_id`，若成功导入为论文则关联
- `error_message`

状态建议：

- `discovered`
- `deduplicated`
- `imported`
- `processed`
- `skipped`
- `failed`

### 5.4 新增 `DailyRun`

记录一次自动化运行：

- `id`
- `run_date`
- `scheduled_for`
- `started_at`
- `completed_at`
- `status`
- `trigger_type`，取值：`scheduled` / `manual`
- `stats_json`
- `error_message`

用途：

- 排查自动化失败
- 统计抓取成功率
- 关联日报与抓取明细

### 5.5 新增 `DailyBriefing`

日报主表：

- `id`
- `daily_run_id`
- `briefing_date`
- `status`
- `generated_at`
- `top_n`
- `summary_markdown`
- `paper_count`
- `project_count`
- `source_count`
- `fallback_used`

### 5.6 新增 `DailyBriefingPaperItem`

日报论文 Top 5：

- `id`
- `briefing_id`
- `paper_id`
- `rank`
- `score`
- `reason`
- `source_kind`

### 5.7 新增 `DailyBriefingProjectItem`

日报相关项目侧栏：

- `id`
- `briefing_id`
- `ingestion_item_id`
- `rank`
- `title`
- `url`
- `summary`
- `source_kind`

---

## 6. 统一标准化结构

### 6.1 `SourceCandidate`

所有 adapter 输出统一结构：

- `artifact_type`
- `source_kind`
- `external_id`
- `title`
- `authors`
- `abstract_raw`
- `canonical_url`
- `pdf_url`
- `published_at`
- `metadata`

### 6.2 `artifact_type`

首批只允许两类：

- `paper`
- `project`

约束：

- `paper` 才允许进入论文导入与 Top 5 排序
- `project` 只进入“相关项目”侧栏

### 6.3 去重指纹

优先级：

1. `external_id`
2. `pdf_url`
3. `canonical_url`
4. `normalized(title) + published_at`

其中：

- `normalized(title)` 去掉空格、大小写差异、常见前后缀噪声
- 同一指纹命中则视为重复项

---

## 7. 每日编排流程

### 7.1 触发方式

第一版提供两种触发：

- 自动触发：按 `AutomationSettings` 每天运行
- 手动补跑：工作看板提供“立即补跑今天日报”按钮

### 7.2 自动运行流程

1. 读取 `AutomationSettings`
2. 若 `enabled=false`，本次跳过
3. 创建 `DailyRun`
4. 遍历所有启用订阅
5. 调用对应 `SourceAdapter.fetch()`
6. 将结果写入 `IngestionItem`
7. 对 `paper` 类型执行去重
8. 新项导入 `Paper`
9. 对导入成功的论文执行处理链路
10. 汇总“今天新抓到且处理完成”的论文
11. 调 AI 排序，生成 Top 5
12. 生成 `DailyBriefing`
13. 写入项目侧栏
14. 标记 `DailyRun` 完成

### 7.3 “今天”的定义

统一按 `AutomationSettings.timezone` 解释自然日。

当日候选范围依据：

- `IngestionItem.discovered_at` 落在当前自然日内

当日论文入选条件：

- 对应 `IngestionItem.artifact_type = paper`
- `Paper.status = ready`
- 且该 `Paper` 由当日 `IngestionItem` 导入或命中

### 7.4 处理链路

论文处理仍复用现有服务：

- `PaperPipelineService.parse_paper`
- `PaperPipelineService.summarize_paper`
- 自动分类逻辑

第一版建议由编排器直接串行或小并发调用服务层，而不是为每篇论文再发起大量线程任务。

原因：

- 当前任务队列是进程内线程模型
- 每日日报是批处理任务，容易与手动操作竞争资源
- 先控制并发更稳，后续再做更复杂的队列拆分

推荐并发策略：

- 抓取：按订阅轻量串行或小并发
- 解析：串行或限制为 `1-2`
- 摘要：限制为 `1-2`
- 分类：跟摘要同步完成

---

## 8. 多源适配器设计

### 8.1 arXiv

输入：

- 查询语句
- 最大结果数

输出：

- 标题、作者、摘要、PDF URL、arXiv ID、发布时间

特点：

- 作为最稳定的论文源
- PDF 可直接导入

### 8.2 RSS

输入：

- Feed URL

输出：

- 标题、链接、发布时间、摘要预览

策略：

- 优先从 feed 中提取主链接与摘要
- 若能解析到论文 PDF 或落地页，则标记为 `paper`
- 若仅有文章链接且无法形成论文导入，则可暂时跳过或标记失败

第一版限制：

- RSS 只支持标准 feed
- 非标准站点解析不做通用爬虫

### 8.3 OpenReview

输入：

- `venue` / `group` / `invitation` 等配置

输出：

- 标题、作者、摘要、论坛链接、PDF 链接、发布时间

策略：

- 以投稿或论文条目作为候选
- 有 PDF 时按论文导入

### 8.4 Hugging Face Papers

输入：

- 页面配置或 feed 配置

输出：

- 标题、摘要、主链接、若可解析则补 PDF 或 arXiv 链接

策略：

- 作为发现源
- 尽量回溯到论文主链接或 arXiv 链接
- 找不到稳定论文资源时不进入论文导入

### 8.5 GitHub Trending

输入：

- 语言
- 时间窗口
- 可选 topic

输出：

- 仓库名
- 描述
- URL
- 星标趋势信息

策略：

- 统一标记为 `artifact_type = project`
- 不进入 `Paper`
- 不触发解析、摘要、分类
- 只进入日报项目侧栏

---

## 9. AI 排序与日报生成

### 9.1 Top 5 输入范围

仅输入当日处理完成论文：

- 标题
- 一句话摘要
- 核心贡献
- 方法概述
- 来源
- 可选标签/分类

### 9.2 排序目标

让模型按以下综合维度排序：

- 相关性
- 新颖性
- 可读性

输出：

- Top 5 的排序结果
- 每篇 1 条推荐理由
- 一段当日总览摘要

### 9.3 降级策略

如果 AI 排序失败：

- 按规则排序代替
- 规则优先级建议：
  - 已有完整摘要字段
  - 来源优先级
  - 发布时间新
  - 标题质量与摘要完整度

模板文案输出：

- “今日共完成 X 篇论文处理，以下为按规则筛选的 Top 5”

### 9.4 日报快照原则

日报生成后立即落库。

原则：

- 当天日报一旦生成，不因后续论文状态变化自动漂移
- 若需要更新，当作一次显式“重生成”
- 前端默认显示最新成功日报

---

## 10. 工作看板 UI 设计

### 10.1 页面定位

不新增独立日报页，直接在现有“工作看板”中展示。

### 10.2 看板结构

#### 顶部状态条

展示：

- 日报日期
- 生成时间
- 运行状态
- 覆盖源数
- 当日完成论文数

提供操作：

- 立即补跑今天日报
- 打开自动化设置
- 切换历史日期

#### 主内容区左侧

展示“今日精选 Top 5”：

- 当日 AI 总结
- 1 到 5 篇精选论文
- 每篇显示：
  - 标题
  - 一句话推荐理由
  - 摘要亮点
  - 来源标签

交互：

- 点击进入现有论文详情页

#### 主内容区右侧

两个侧栏卡片：

- `今日论文列表`
  - 展示当日处理完成的全部论文
- `相关项目`
  - 展示 GitHub Trending 项目

### 10.3 历史日报切换

支持在工作看板中切换：

- 今天
- 昨天
- 最近若干天

若今天尚未生成成功日报：

- 优先显示“今日运行状态”
- 可回退最近一期成功日报
- 明确标注展示日期，避免误解

### 10.4 自动化设置 UI

新增配置入口，至少包含：

- 是否启用自动化
- 生成时间
- 时区
- Top N
- 是否展示相关项目侧栏

首批仅做全局配置，不做订阅级调度设置

---

## 11. API 设计

### 11.1 自动化设置

- `GET /automation/settings`
- `PUT /automation/settings`

### 11.2 手动补跑

- `POST /automation/runs/today`

返回：

- `run_id`
- `status`

### 11.3 日报查询

- `GET /briefing/today`
- `GET /briefing/history?days=7`
- `GET /briefing/{date}`

返回内容包含：

- 日报主信息
- Top 5 论文
- 当日论文列表
- 项目侧栏
- 运行状态摘要

### 11.4 订阅扩展

现有订阅 API 扩展支持：

- 多源 `source_kind`
- 源配置表单结构
- 测试抓取预览

建议新增：

- `POST /subscriptions/preview/fetch`
  - 用给定配置预览抓取结果，不保存订阅

### 11.5 运行记录

建议新增：

- `GET /automation/runs`
- `GET /automation/runs/{run_id}`

便于排查日报失败原因

---

## 12. 失败处理与重试策略

### 12.1 分层失败

#### 源抓取失败

- 记录到 `DailyRun` 与 `Subscription.last_error`
- 不阻塞其他源继续运行

#### 候选项去重/导入失败

- 记录到 `IngestionItem.error_message`
- 跳过当前项

#### 解析失败

- 论文保留导入记录
- 不进入日报候选

#### 摘要失败

- 论文不进入当日 Top 5
- 可以保留在“当日论文列表”的失败统计中

#### 排序或文案失败

- 启用规则排序 + 模板摘要降级
- 不让整期日报空白

### 12.2 重试语义

第一版提供两类重试：

- 整天重跑：手动补跑今天日报
- 论文级补处理：继续复用已有手动“解析/生成摘要”能力

第一版不做：

- 细粒度自动指数退避重试系统
- 复杂死信队列

---

## 13. 测试策略

### 13.1 单元测试

覆盖：

- 各 adapter 的标准化输出
- 去重指纹生成
- 当日论文筛选逻辑
- AI 排序结果解析与降级逻辑
- 自动化设置读写

### 13.2 集成测试

覆盖：

- 每日编排主流程
- 部分源失败时仍能生成日报
- 多源重复论文去重
- GitHub 项目正确进入侧栏而不进入 Top 5

### 13.3 API 测试

覆盖：

- 自动化设置读写接口
- 手动补跑接口
- 日报查询接口
- 订阅多源配置与预览接口

### 13.4 前端测试

覆盖：

- 工作看板展示日报快照
- 历史切换
- 生成中 / 失败 / 成功三种状态
- 自动化设置表单

### 13.5 验收标准

满足以下条件视为第一版完成：

- 至少支持 `arXiv / RSS / OpenReview / Hugging Face Papers / GitHub Trending`
- 可以通过 UI 修改自动化时间、时区、Top N
- 每天自动生成一份当日日报快照
- 日报只统计“今天新抓到且处理完成”的论文
- 工作看板直接展示 Top 5、摘要、论文列表、项目侧栏
- 部分源失败时仍能看到降级可用的日报

---

## 14. 迁移与落地顺序

建议分四步实现：

### 阶段 1：后端数据模型与全局配置

- 扩展 `Subscription`
- 新增 `AutomationSettings`
- 新增 `DailyRun / IngestionItem / DailyBriefing*`

### 阶段 2：多源 adapter 与每日编排器

- 先打通 `arXiv / RSS`
- 再接入 `OpenReview / Hugging Face Papers / GitHub Trending`
- 完成去重与导入主链路

### 阶段 3：日报生成与 API

- Top 5 排序
- 日报快照落库
- 历史查询

### 阶段 4：工作看板改造与自动化设置 UI

- 工作看板消费日报快照
- 历史切换
- 自动化设置弹窗或设置区
- 手动补跑入口

---

## 15. 风险与权衡

### 15.1 外部源结构不稳定

RSS、Hugging Face Papers、GitHub Trending 的结构可能变化较快。

应对：

- 把抓取逻辑隔离在 adapter
- 每个源允许单独失败

### 15.2 单体进程调度能力有限

当前是进程内线程队列，不适合高并发批量跑。

应对：

- 第一版控制并发
- 优先保证中午一轮稳定跑完

### 15.3 多源重复项复杂

同一论文可能在 arXiv、OpenReview、HF 页面重复出现。

应对：

- 统一指纹
- 把 `IngestionItem` 与 `Paper` 分开

### 15.4 “当天”语义易混淆

如果按发布时间而不是抓取时间聚合，会和用户预期不一致。

决策：

- 一律按 `discovered_at` 作为“今天新抓到”的判断标准

---

## 16. 最终结论

本次功能的最佳落地方向是：

- 用统一 `SourceAdapter` 接入多源
- 用全局 `AutomationSettings` 提供 UI 可配置自动化
- 用 `DailyRun + IngestionItem + DailyBriefing` 建立完整的抓取、处理、日报快照链路
- 在“工作看板”中直接展示每日速览
- 保持论文 Top 5 与 GitHub 项目侧栏的口径分离

这套设计在现有项目基础上改动可控，能够优先交付你需要的“中午自动出一份像截图那样的每日速览”，同时为后续扩展更多源、增加通知、提升调度能力预留清晰边界。
