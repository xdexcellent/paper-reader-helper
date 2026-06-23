from pydantic import BaseModel


class PaperBlockResponse(BaseModel):
    id: int
    paper_id: int
    page_index: int | None = None
    block_index: int
    block_type: str
    text: str
    bbox: list[float] | None = None
    asset_path: str = ""
    source_hash: str


class PaperBlocksResponse(BaseModel):
    paper_id: int
    total: int
    returned: int
    pages: list[int]
    block_types: dict[str, int]
    has_blocks: bool
    blocks: list[PaperBlockResponse]
    error: str = ""


class PaperBlockRebuildResponse(BaseModel):
    paper_id: int
    block_count: int
    has_blocks: bool


class BlockTranslateRequest(BaseModel):
    target_language: str = "zh-CN"
    model: str | None = None
    force_refresh: bool = False


class PaperBlockTranslationResponse(BaseModel):
    id: int
    paper_id: int
    block_id: int
    target_language: str
    model_name: str
    prompt_version: str
    source_hash: str
    translated_text: str
    status: str
    error_message: str
