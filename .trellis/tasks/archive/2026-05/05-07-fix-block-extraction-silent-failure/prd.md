# 修复论文解析后结构块为空

## 目标

论文状态显示"已解析"但结构块为空。后端 `pipeline.py` 中 block extraction 被 try/except 静默吞掉，用户看不到任何提示。

## 根因

`pipeline.py:89-98` 中 block extraction 失败时只打 warning，不影响 parse 状态显示为 completed。用户以为解析成功，实际 blocks 是空的。

## 修复方案

1. **后端**: 当 extraction 失败时，将错误信息存到 `PaperContent`（新增 `block_extraction_error` 字段），让 blocks API 和前端能感知
2. **API**: `PaperBlocksResponse` 增加 `error` 字段，返回上次 extraction 失败信息
3. **前端**: 空状态时显示具体错误原因 + Rebuild 按钮

## 文件变更

| 文件 | 变更 |
|------|------|
| `backend/app/models/paper_content.py` | 新增 `block_extraction_error: str` 字段 |
| `backend/app/services/pipeline.py` | extraction 失败时写入 error 到 content |
| `backend/app/schemas/paper_blocks.py` | `PaperBlocksResponse` 增加 `error` 字段 |
| `backend/app/api/routes/paper_blocks.py` | 返回 content.block_extraction_error |
| `frontend/src/types.ts` | PaperBlocksResponse 增加 error |
| `frontend/src/components/reader/ReaderBlocksPanel.tsx` | 空状态显示错误信息 |

## 验收

- [ ] parse 后如果 extraction 失败，前端显示具体错误而非单纯的"No blocks"
- [ ] Rebuild 按钮始终可用
- [ ] rebuild 成功后错误清除
