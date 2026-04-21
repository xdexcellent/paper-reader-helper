import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, Session, create_engine

from app.core.db import engine as app_engine, ensure_sqlite_parent_dir
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_summary import PaperSummary


def test_paper_content_and_summary_reference_paper_table() -> None:
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    inspector = inspect(engine)

    content_foreign_keys = inspector.get_foreign_keys(PaperContent.__tablename__)
    summary_foreign_keys = inspector.get_foreign_keys(PaperSummary.__tablename__)

    assert any(
        foreign_key["referred_table"] == Paper.__tablename__
        and foreign_key["constrained_columns"] == ["paper_id"]
        and foreign_key["referred_columns"] == ["id"]
        for foreign_key in content_foreign_keys
    )
    assert any(
        foreign_key["referred_table"] == Paper.__tablename__
        and foreign_key["constrained_columns"] == ["paper_id"]
        and foreign_key["referred_columns"] == ["id"]
        for foreign_key in summary_foreign_keys
    )


@pytest.mark.parametrize(
    ("model_class", "payload"),
    [
        (PaperContent, {"full_markdown": "content"}),
        (PaperSummary, {"one_line_summary": "summary"}),
    ],
)
def test_sqlite_runtime_rejects_invalid_paper_foreign_keys(model_class, payload) -> None:
    ensure_sqlite_parent_dir("sqlite:///./test-data/test.db")
    SQLModel.metadata.drop_all(app_engine)
    SQLModel.metadata.create_all(app_engine)

    with Session(app_engine) as session:
        session.add(model_class(paper_id=999999, **payload))

        with pytest.raises(IntegrityError):
            session.commit()
