import json
from pydantic import BaseModel, ConfigDict, model_validator


class PaperImportRequest(BaseModel):
    title: str
    source: str
    local_pdf_path: str


class PaperImportUrlRequest(BaseModel):
    title: str
    source: str
    source_id: str
    url: str
    authors: str = ""
    abstract: str = ""
    published_at: str = ""


class PaperResponse(BaseModel):
    id: int
    title: str
    source: str
    status: str
    parse_status: str
    summary_status: str
    embedding_status: str
    local_pdf_path: str
    primary_category_id: int | None = None
    category_status: str = "pending_review"
    category_confidence: float = 0.0
    category_reason: str = ""
    tags: list[str] = []

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode='before')
    @classmethod
    def extract_tags(cls, data):
        # Handle both dict and ORM object
        if hasattr(data, '__dict__'):
            # ORM object
            tags_json = getattr(data, 'tags_json', '[]')
        elif isinstance(data, dict):
            tags_json = data.pop('tags_json', data.get('tags', '[]'))
        else:
            return data
        
        if isinstance(tags_json, str):
            try:
                tags = json.loads(tags_json)
            except (json.JSONDecodeError, TypeError):
                tags = []
        elif isinstance(tags_json, list):
            tags = tags_json
        else:
            tags = []
        
        if hasattr(data, '__dict__'):
            # Return dict for ORM objects
            d = {}
            for field in ['id', 'title', 'source', 'status', 'parse_status', 
                         'summary_status', 'embedding_status', 'local_pdf_path',
                         'primary_category_id', 'category_status', 'category_confidence',
                         'category_reason']:
                d[field] = getattr(data, field, '')
            d['tags'] = tags
            return d
        else:
            data['tags'] = tags
            return data


class PaperDetailResponse(PaperResponse):
    full_markdown: str = ""
    abstract_md: str = ""
    introduction_md: str = ""
    method_md: str = ""
    conclusion_md: str = ""
    one_line_summary: str = ""
    core_contributions: str = ""
    method_summary: str = ""
    use_cases: str = ""
    limitations: str = ""
    relevance_note: str = ""
