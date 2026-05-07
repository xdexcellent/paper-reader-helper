import json
from pydantic import BaseModel, ConfigDict, field_validator, model_validator


READING_STATUSES = {"unread", "reading", "read", "skipped"}


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


class PaperUpdateRequest(BaseModel):
    title: str | None = None
    source: str | None = None
    authors: str | None = None
    abstract_raw: str | None = None
    year: int | None = None
    venue: str | None = None
    doi: str | None = None
    url: str | None = None
    favorite: bool | None = None
    reading_status: str | None = None
    reading_progress: int | None = None
    user_notes: str | None = None

    @field_validator(
        "title",
        "source",
        "authors",
        "abstract_raw",
        "venue",
        "doi",
        "url",
        "reading_status",
        mode="before",
    )
    @classmethod
    def strip_string_fields(cls, value):
        if value is None or not isinstance(value, str):
            return value
        return value.strip()

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value):
        if value is not None and value == "":
            raise ValueError("title must not be blank")
        return value

    @field_validator("year")
    @classmethod
    def year_must_be_supported(cls, value):
        if value is not None and not 1500 <= value <= 3000:
            raise ValueError("year must be between 1500 and 3000")
        return value

    @field_validator("url")
    @classmethod
    def url_must_be_http_or_blank(cls, value):
        if value and not value.startswith(("http://", "https://")):
            raise ValueError("url must be blank or an HTTP(S) URL")
        return value

    @field_validator("reading_status")
    @classmethod
    def reading_status_must_be_allowed(cls, value):
        if value is not None and value not in READING_STATUSES:
            allowed = ", ".join(sorted(READING_STATUSES))
            raise ValueError(f"reading_status must be one of: {allowed}")
        return value

    @field_validator("reading_progress")
    @classmethod
    def reading_progress_must_be_percent(cls, value):
        if value is not None and not 0 <= value <= 100:
            raise ValueError("reading_progress must be between 0 and 100")
        return value


class PaperResponse(BaseModel):
    id: int
    title: str
    source: str
    authors: str = ""
    abstract_raw: str = ""
    year: int | None = None
    venue: str = ""
    doi: str = ""
    url: str = ""
    favorite: bool = False
    reading_status: str = "unread"
    reading_progress: int = 0
    user_notes: str = ""
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
            for field in [
                'id', 'title', 'source', 'authors', 'abstract_raw', 'year',
                'venue', 'doi', 'url', 'favorite', 'reading_status',
                'reading_progress', 'user_notes', 'status', 'parse_status',
                'summary_status', 'embedding_status', 'local_pdf_path',
                'primary_category_id', 'category_status', 'category_confidence',
                'category_reason',
            ]:
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
