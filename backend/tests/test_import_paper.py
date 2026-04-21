from pathlib import Path

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings


def test_import_paper_creates_queued_record(client, tmp_path: Path) -> None:
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 sample")

    response = client.post(
        "/papers/import",
        json={
            "title": "Sample Paper",
            "source": "manual",
            "local_pdf_path": str(pdf_path),
        },
    )

    body = response.json()
    assert response.status_code == 201
    assert body["title"] == "Sample Paper"
    assert body["status"] == "queued"
    assert body["parse_status"] == "pending"
    assert body["summary_status"] == "pending"
    assert body["embedding_status"] == "pending"
    assert body["local_pdf_path"].endswith("sample.pdf")


def test_import_paper_keeps_same_named_pdfs_in_distinct_paths(client, tmp_path: Path) -> None:
    first_pdf = tmp_path / "source-a" / "same.pdf"
    second_pdf = tmp_path / "source-b" / "same.pdf"
    first_pdf.parent.mkdir(parents=True)
    second_pdf.parent.mkdir(parents=True)
    first_pdf.write_bytes(b"%PDF-1.4 first")
    second_pdf.write_bytes(b"%PDF-1.4 second")

    first_response = client.post(
        "/papers/import",
        json={
            "title": "First Paper",
            "source": "manual",
            "local_pdf_path": str(first_pdf),
        },
    )
    second_response = client.post(
        "/papers/import",
        json={
            "title": "Second Paper",
            "source": "manual",
            "local_pdf_path": str(second_pdf),
        },
    )

    first_body = first_response.json()
    second_body = second_response.json()
    first_stored_path = Path(first_body["local_pdf_path"])
    second_stored_path = Path(second_body["local_pdf_path"])

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert first_stored_path != second_stored_path
    assert first_stored_path.name == "same.pdf"
    assert second_stored_path.name == "same.pdf"
    assert first_stored_path.is_file()
    assert second_stored_path.is_file()
    assert first_stored_path.read_bytes() == b"%PDF-1.4 first"
    assert second_stored_path.read_bytes() == b"%PDF-1.4 second"


def test_import_paper_rejects_directory_path_without_creating_storage_artifacts(
    client, tmp_path: Path
) -> None:
    invalid_path = tmp_path / "not-a-pdf"
    invalid_path.mkdir()
    papers_dir = Path(settings.storage_root) / "papers"
    before_dirs = {path for path in papers_dir.glob("*") if path.is_dir()} if papers_dir.exists() else set()

    response = client.post(
        "/papers/import",
        json={
            "title": "Bad Import",
            "source": "manual",
            "local_pdf_path": str(invalid_path),
        },
    )

    after_dirs = {path for path in papers_dir.glob("*") if path.is_dir()} if papers_dir.exists() else set()

    assert response.status_code == 400
    assert response.json() == {"detail": "PDF 文件不存在"}
    assert after_dirs == before_dirs


def test_import_paper_cleans_up_stored_file_when_database_commit_fails(
    client, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pdf_path = tmp_path / "commit-fail.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 commit fail")
    papers_dir = Path(settings.storage_root) / "papers"
    before_dirs = {path for path in papers_dir.glob("*") if path.is_dir()} if papers_dir.exists() else set()

    from app.api.routes import papers as papers_route_module

    original_commit = papers_route_module.Session.commit

    def failing_commit(session) -> None:
        raise SQLAlchemyError("commit failed")

    monkeypatch.setattr(papers_route_module.Session, "commit", failing_commit)

    with pytest.raises(SQLAlchemyError, match="commit failed"):
        client.post(
            "/papers/import",
            json={
                "title": "Commit Fail",
                "source": "manual",
                "local_pdf_path": str(pdf_path),
            },
        )

    monkeypatch.setattr(papers_route_module.Session, "commit", original_commit)
    after_dirs = {path for path in papers_dir.glob("*") if path.is_dir()} if papers_dir.exists() else set()

    assert after_dirs == before_dirs
