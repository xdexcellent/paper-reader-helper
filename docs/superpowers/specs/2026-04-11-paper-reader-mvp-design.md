# 论文阅读器 MVP 设计稿

## 1. 目标与约束

### 1.1 目标
构建一个本机优先、后续可拆云端的论文阅读器 MVP，核心能力包括：
- 论文采集与导入
- MinerU API 解析 PDF/文档并产出 Markdown
- 基于章节抽取的 DeepSeek API 摘要生成
- 本地向量化与 RAG 检索
- 阅读优先的论文管理与详情阅读界面
- 单篇论文问答能力

### 1.2 核心产品目标
- 第一优先级：阅读体验
- 第二优先级：检索与筛选效率
- 第三优先级：单篇问答增强

### 1.3 约束条件
- 当前硬件为笔记本 RTX 3060 6G
- 不适合在本机承担高峰期重解析任务
- 解析主链路改为 MinerU 官方 API
- 总结主链路改为官方 DeepSeek API
- 目标吞吐按每天约 10 篇、每 30~60 分钟增量处理估算
- 部署方式优先支持本机 Docker 化，方便未来迁移云端

---

## 2. 总体方案

### 2.1 推荐方案
采用“成本/速度平衡版”架构：
- MinerU API 负责文档解析
- DeepSeek API 负责主力总结
- 本地仅承担轻量清洗、章节抽取、向量化、检索和阅读界面
- 后端采用异步增量流水线，避免 6G 显存设备被高峰任务压垮

### 2.2 总体原则
- 阅读优先，问答增强
- 先本机 MVP，后续可拆云端
- 低显存、低并发、异步增量
- 失败降级，不阻塞阅读
- 容器化部署边界清晰

### 2.3 非目标
MVP 阶段不做：
- 多用户系统
- 权限体系
- 多篇论文联合问答
- 复杂推荐算法
- 本地大模型总结
- 高级 PDF 版式还原
- 大规模并发任务优化

---

## 3. 系统架构

### 3.1 核心模块
- `collector`：抓取论文元信息、导入本地 PDF
- `parser_gateway`：对接 MinerU API，提交任务并轮询结果
- `section_extractor`：从 Markdown 中抽取 abstract、introduction、method、conclusion
- `summarizer`：调用 DeepSeek API 生成结构化摘要
- `embedder`：使用本地 BGE-M3 进行分块向量化
- `retriever`：执行向量检索并组装 RAG 上下文
- `reader_api`：向前端提供列表、详情、摘要、问答接口
- `scheduler`：每 30~60 分钟触发增量处理

### 3.2 主数据流
`论文入库 -> 解析任务 -> Markdown 清洗 -> 章节提取 -> 摘要生成 -> 向量化 -> ready -> 前端可读/可检索/可问答`

### 3.3 节奏划分
#### 后台慢节奏
- 抓取 / 导入
- MinerU API 解析
- Markdown 清洗与章节提取
- DeepSeek 摘要生成
- 向量化入库

#### 前台快节奏
- 浏览论文列表
- 查看摘要
- 阅读 Markdown 正文
- 搜索与筛选
- 对单篇论文进行问答

---

## 4. 数据模型设计

### 4.1 `papers`
论文主记录：
- `id`
- `source`
- `source_id`
- `title`
- `authors`
- `abstract_raw`
- `pdf_url`
- `local_pdf_path`
- `published_at`
- `status`
- `parse_status`
- `summary_status`
- `embedding_status`
- `ready_at`
- `created_at`
- `updated_at`

### 4.2 `paper_contents`
解析正文内容：
- `paper_id`
- `full_markdown`
- `abstract_md`
- `introduction_md`
- `method_md`
- `conclusion_md`
- `content_json_path`
- `full_zip_path`

### 4.3 `paper_chunks`
分块与索引：
- `id`
- `paper_id`
- `section`
- `chunk_index`
- `content`
- `token_count`
- `embedding_model`
- `vector_id`

### 4.4 `paper_summaries`
DeepSeek 摘要结果：
- `paper_id`
- `one_line_summary`
- `core_contributions`
- `method_summary`
- `use_cases`
- `limitations`
- `relevance_note`
- `model_name`
- `prompt_version`

### 4.5 `jobs`
统一异步任务：
- `id`
- `paper_id`
- `job_type`
- `status`
- `attempt`
- `payload`
- `result`
- `error_message`
- `scheduled_at`
- `started_at`
- `finished_at`

---

## 5. 状态机设计

### 5.1 论文主状态
- `queued`
- `parsing`
- `parsed`
- `summarizing`
- `embedding`
- `ready`
- `partial_ready`
- `failed`

### 5.2 推荐执行顺序
MVP 推荐顺序：
`queued -> parsing -> parsed -> summarizing -> embedding -> ready`

### 5.3 设计理由
- 先出摘要，优先改善阅读体验
- embedding 失败时不影响“能读”
- 与“阅读优先、问答增强”的目标一致

### 5.4 降级策略
- 解析成功但总结失败：`partial_ready`
- 总结成功但 embedding 失败：`partial_ready`
- 章节抽取失败：fallback 到前文与邻近段落，不阻塞正文阅读

---

## 6. 文档解析与摘要策略

### 6.1 MinerU API 使用方式
- 对 PDF / 文档创建异步解析任务
- 轮询任务状态
- 下载 `full_zip_url`
- 提取 `full.md` 与结构化 JSON

### 6.2 章节提取策略
优先提取：
- `abstract`
- `introduction`
- `method` / `approach` / `methodology`
- `conclusion`

若标准标题缺失，则 fallback 到：
- 元数据摘要
- 正文前若干段
- 标题邻近段落

### 6.3 DeepSeek 摘要输入策略
优先将以下内容拼接后喂给 DeepSeek：
- abstract
- introduction
- method

若内容超长，则按优先级截断，并保留：
- 一句话摘要
- 核心贡献
- 方法概述
- 适用场景
- 局限性
- 与研究方向相关性（可选）

---

## 7. 向量化与检索设计

### 7.1 Chunk 策略
建议分块来源：
- abstract 单独一块
- introduction 分块
- method 分块
- conclusion 分块
- 其余正文按标题切块

### 7.2 Embedding 策略
- 模型：BGE-M3
- 优先本地运行
- 默认使用 GPU 小 batch 串行处理
- 显存紧张时自动降级 CPU

### 7.3 向量库
MVP 推荐：
- `SQLite + FAISS`
或
- `SQLite + Chroma`

推荐顺序：先用 `SQLite + Chroma` 快速落地；若后续需要更明确的索引控制，可切到 `FAISS`。

### 7.4 RAG 范围
MVP 只做：
- 单篇论文问答
- 引用来源段落展示
- 明确标注来源章节

---

## 8. 前端页面与交互设计

### 8.1 页面结构
#### 工作看板
展示：
- 今日新增论文数
- 待解析 / 待总结 / 待向量化数量
- 最近失败任务
- 最近入库论文
- 推荐阅读论文

#### 论文管理页（主页面）
采用三栏工作台：
- 左栏：模块导航
- 中栏：论文列表与筛选
- 右栏：论文详情 / 阅读区

#### 搜索页
提供按关键词、标签、状态、来源的论文与段落检索。

#### 设置页
配置：
- MinerU Token
- DeepSeek API Key
- 调度频率
- 向量化策略
- 存储路径

### 8.2 论文管理页布局
#### 左栏
MVP 先实现：
- 工作看板
- 论文管理
- 搜索
- 设置

#### 中栏
显示：
- 标题
- 作者
- 来源
- 发布时间
- 标签
- 处理状态
- 是否已读 / 已总结 / 可问答

支持：
- 关键词搜索
- 标签筛选
- 状态筛选
- 时间排序
- 来源筛选

#### 右栏
结构为：
- 顶部元信息
- AI 摘要卡片
- 章节导航
- Markdown 正文阅读
- 右侧可收起问答抽屉

### 8.3 论文详情页设计
#### 顶部信息区
展示：
- 标题
- 作者
- 来源
- 发布时间
- 标签
- 当前状态

操作：
- 查看 PDF
- 重新解析
- 重新总结
- 重建索引

#### AI 摘要卡片
展示：
- 一句话摘要
- 核心贡献
- 方法概述
- 局限性
- 与研究方向相关性（可选）

#### 章节导航
至少支持：
- Abstract
- Introduction
- Method
- Conclusion
- Full Text

#### 正文阅读区
- 渲染 `full.md`
- 保留标题层级
- 支持基本公式 / 表格 / 代码块渲染
- 优先保证可读性与锚点跳转，不追求 PDF 像素级还原

### 8.4 问答交互设计
采用“右侧可收起问答抽屉”：
- 默认关闭
- 用户点击后展开
- 不打断主阅读流

展开后包含：
- 提问输入框
- 快捷问题
- 回答区
- 引用来源段落
- 来源章节名

回答原则：
- 仅基于当前论文内容
- 必须提供引用片段
- 证据不足时明确说明

---

## 9. 错误处理与资源保护

### 9.1 错误处理
- 采集失败：记录错误，下周期重试
- MinerU 失败：自动重试 1~2 次，仍失败则标记 `failed`
- 章节提取失败：fallback，不阻塞阅读
- DeepSeek 总结失败：摘要卡片显示失败，可稍后重试
- 向量化失败：论文仍可读，但问答置灰或显示“索引构建中”

### 9.2 性能边界
- 调度频率：每 30~60 分钟一次
- 单轮处理量：2~5 篇起步
- MinerU API：允许少量并发
- 本地清洗：串行
- DeepSeek 总结：小并发
- BGE-M3 向量化：严格串行、小 batch

### 9.3 背压策略
当待处理论文堆积时：
- 优先完成“解析 + 摘要”
- embedding 可延后
- 保证论文尽快进入可阅读状态

---

## 10. Docker 化部署建议

### 10.1 MVP 部署目标
在本机以 Docker 为主部署方式，便于后续迁移到云端环境。

### 10.2 推荐容器划分
MVP 阶段建议最少拆成以下服务：
- `frontend`：前端阅读器界面
- `backend`：API、调度、任务执行
- `vector-db`：如使用 Chroma 时可独立容器化；若使用本地 FAISS 可先挂载卷由 backend 管理

### 10.3 挂载与持久化
建议持久化：
- SQLite 数据文件
- 下载的 PDF
- MinerU 结果 ZIP / Markdown
- 向量索引文件
- 应用日志

### 10.4 环境变量
至少包含：
- `MINERU_API_TOKEN`
- `DEEPSEEK_API_KEY`
- `DATABASE_URL`
- `STORAGE_ROOT`
- `SCHEDULER_INTERVAL_MINUTES`

### 10.5 迁移收益
后续迁移到云端时，可优先保持：
- 前后端镜像不变
- 配置改为云端环境变量
- 存储卷改为云盘或对象存储
- 任务执行逻辑按服务拆分

---

## 11. 测试与验收

### 11.1 单元测试
覆盖：
- Markdown 清洗
- 章节提取
- Chunk 切分
- 状态流转逻辑

### 11.2 集成测试
覆盖：
- MinerU API 成功 / 超时 / 失败
- DeepSeek API 异常降级
- 向量写入与检索

### 11.3 端到端冒烟测试
准备 1~3 篇样本论文，验证：
`导入 -> 解析 -> 提取 -> 摘要 -> 向量化 -> 阅读 -> 单篇问答`

### 11.4 MVP 验收标准
- 新论文能在一个调度周期内进入可阅读状态
- 大多数论文能成功抽出摘要 / 引言 / 方法
- 摘要卡片足以支持快速筛论文
- 单篇问答能展示引用来源
- 本机处理期间不会频繁爆显存或卡死

---

## 12. 后续演进方向

后续可在不推翻 MVP 的前提下逐步演进：
- 将 `parser_gateway` 和 `scheduler` 拆到云端任务服务
- 将 `jobs` 从 SQLite 迁移到 PostgreSQL / Redis 队列
- 将向量索引从本地切换到远端服务
- 增加多篇论文联合问答
- 增加研究方向相关性打分与推荐

---

## 13. 最终结论

该 MVP 的最优落地方向是：
- 本机优先
- Docker 化部署
- MinerU API 负责重解析
- DeepSeek API 负责主力总结
- 本地承担轻量清洗、向量化、检索与阅读界面
- 以“阅读优先、问答增强”为产品主线

这套方案在 RTX 3060 6G 的硬件约束下可行，并且后续迁移到云端时具备良好的结构延续性。
