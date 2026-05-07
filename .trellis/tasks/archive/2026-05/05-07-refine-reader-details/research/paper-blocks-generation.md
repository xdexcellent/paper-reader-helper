# Research: 论文结构块生成逻辑

- **Query**: 论文显示为 "parsed" 但结构块为空的原因，解析与结构块生成的关系
- **Scope**: internal（后端 pipeline + API + 前端消费）
- **Date**: 2026-05-07

## Findings

### 1. 解析与结构块生成的关系

**结构块在解析任务中自动生成，但非阻塞。**

文件：`backend/app/services/pipeline.py` 第 89-98 行

```python
try:
    self.block_extraction_service.rebuild_blocks(session, paper, content)
    session.commit()
except Exception:
    session.rollback()
    logger.warning(
        "Block extraction failed for paper %s; parse remains completed",
        paper.id,
        exc_info=True,
    )
```

关键点：
- `parse_paper()` 在 MinerU 解析完成后，**紧接着**调用 `rebuild_blocks()` 生成结构块
- 但 block extraction 被 try/except 包裹，**失败时只记 warning，不阻挠 parse 的成功状态**
- paper.status 仍然设为 `"parsed"`，paper.parse_status 仍然设为 `"completed"`
- 这意味着论文可以显示为 "parsed" 但结构块为零

### 2. 完整的 parse 流水线

文件：`backend/app/services/pipeline.py` 第 35-100 行

```
MinerU.parse_pdf(PDF)
    → 产出 full_markdown, content_json_path, full_zip_path
    → 存入 PaperContent

BlockExtractionService.rebuild_blocks(session, paper, content)
    → 从 content_json_path / full_zip_path 中提取结构块候选
    → 写入 PaperBlock 表
    → ⚠ 失败时静默跳过（不改变 parse 状态）
```

MinerU 产出的 artifact 是两个路径：
| 字段 | 含义 |
|---|---|
| `content_json_path` | 结构化 JSON（单文件） |
| `full_zip_path` | 包含多 JSON 文件的 zip 包 |

### 3. BlockExtractionService 提取逻辑

文件：`backend/app/services/block_extraction_service.py`

**提取优先级**（第 59-71 行）：
1. 先尝试从 `full_zip_path` 提取（zip 包内有多个 JSON）
2. zip 不可用时从 `content_json_path` 提取（单 JSON）
3. 两者都不可用时返回空列表 `[]`

**zip 内 JSON 优先级**（第 21-26 行）：
1. `content_list_v2`
2. `content_list`
3. `middle`
4. `model`

**提取失败的可能原因**：
- MinerU 产出格式不在预期 JSON 结构中（如 `content_list_v2` / `content_list` 字段缺失）
- zip 中的 JSON 解析失败
- 所有 candidate entry 都没有 text 且没有 bbox，被 `_normalize_entry` 过滤掉（第 205 行）

### 4. 手动重建结构块的 API

文件：`backend/app/api/routes/paper_blocks.py` 第 41-64 行

```
POST /papers/{paper_id}/blocks/rebuild
```

此端点：
- 要求 PaperContent 存在且 `content_json_path` 或 `full_zip_path` 非空，否则返回 409
- 调用 `BlockExtractionService().rebuild_blocks()` 重新提取
- 返回 `{ paper_id, block_count, has_blocks }`

### 5. 查询结构块的 API

文件：`backend/app/api/routes/paper_blocks.py` 第 26-38 行

```
GET /papers/{paper_id}/blocks
```

当没有结构块时，返回：
```json
{
  "paper_id": 1,
  "total": 0,
  "returned": 0,
  "pages": [],
  "block_types": {},
  "has_blocks": false,
  "blocks": []
}
```

### 6. 前端处理

文件：`frontend/src/components/reader/useReaderBlocks.ts` 第 19-35 行

- 前端在 ReaderPage 中通过 `useReaderBlocks` hook 调用 `fetchPaperBlocks()`
- 当 `blocks.length === 0` 时，`ReaderBlocksPanel` 显示 "No structured blocks yet" 并提供一个 **"Rebuild blocks"** 按钮
- 用户点击后调用 `POST /papers/{paper_id}/blocks/rebuild`，然后重新 fetch blocks

文件：`frontend/src/components/reader/ReaderBlocksPanel.tsx` 第 111-117 行

### 7. 为什么已解析的论文可能没有结构块

| 原因 | 可能性 |
|------|:---:|
| MinerU 产出的结构化文件格式不被 `extract_from_parse_result` 支持 | 高 |
| `content_json_path` / `full_zip_path` 为空（MinerU 只产出了 markdown，没有结构化数据） | 中 |
| block extraction 抛异常被 silently catch | 中 |
| zip/JSON 解析出错 | 低 |
| Candidate entries 全部因为没有 text 和 bbox 被过滤掉 | 低 |

## 代码文件清单

| 文件路径 | 说明 |
|---|---|
| `backend/app/api/routes/papers.py` | 论文 API，含 `POST /parse` 触发解析 |
| `backend/app/api/routes/paper_blocks.py` | 结构块 API：`GET /blocks`，`POST /rebuild`，`POST /translate` |
| `backend/app/services/pipeline.py` | 解析 pipeline，`parse_paper()` 第 89 行调用 block extraction |
| `backend/app/services/block_extraction_service.py` | 结构块提取服务，从 MinerU artifact 中抽取 block candidates |
| `backend/app/models/paper.py` | Paper 模型，含 `status` / `parse_status` 字段 |
| `backend/app/models/paper_content.py` | PaperContent 模型，含 `content_json_path` / `full_zip_path` |
| `backend/app/models/paper_block.py` | PaperBlock 模型 |
| `backend/app/schemas/paper_blocks.py` | Block API 的请求/响应 schema |
| `frontend/src/components/reader/useReaderBlocks.ts` | 前端 blocks 加载 & rebuild 逻辑 |
| `frontend/src/components/reader/ReaderBlocksPanel.tsx` | 前端 blocks 展示面板（含空状态 & rebuild 按钮） |

## Caveats / Not Found

- **MineruClient 的具体实现**（`backend/app/services/mineru_client.py`）未阅读——这决定了 MinerU 产出的 artifact 具体格式。如果 artifact 格式不匹配，`extract_from_parse_result` 将返回空。
- 未确认当前环境 MinerU 的版本及产出格式是否与 `block_extraction_service.py` 的预期一致。
- 后端日志中的 "Block extraction failed for paper %s" warning 是诊断关键——检查日志可确认是否是 extraction 异常。
