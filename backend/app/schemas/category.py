from pydantic import BaseModel, ConfigDict


class CategoryResponse(BaseModel):
    id: int
    name: str
    slug: str
    parent_id: int | None = None
    description: str = ""
    is_system: bool = True
    is_active: bool = True
    is_pending_bucket: bool = False
    sort_order: int = 0
    paper_count: int = 0
    pending_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class CategoryCreateRequest(BaseModel):
    name: str
    description: str = ""


class CategoryUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
