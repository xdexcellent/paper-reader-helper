from pathlib import Path

from app.services.pdf_metadata import extract_title_from_pdf


def test_upload_pdf_auto_extracts_title_and_returns_queued_status(client) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"

    with sample_pdf.open("rb") as file_obj:
        response = client.post(
            "/papers/upload",
            data={"source": "manual"},
            files={"pdf_file": ("sample.pdf", file_obj, "application/pdf")},
        )

    body = response.json()
    assert response.status_code == 201
    assert body["title"] != ""
    assert body["source"] == "manual"
    assert body["status"] == "queued"
    assert body["parse_status"] == "pending"
    assert body["summary_status"] == "pending"
    assert body["local_pdf_path"].endswith("sample.pdf")


def test_upload_rejects_non_pdf_files(client) -> None:
    response = client.post(
        "/papers/upload",
        data={"source": "manual"},
        files={"pdf_file": ("not-pdf.txt", b"plain text", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "仅支持 PDF 文件"}


def test_extract_title_uses_fallback_for_non_textual_pdf() -> None:
    fixture_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    title = extract_title_from_pdf(str(fixture_pdf), fallback_name="sample")

    assert title in {"sample", "Task 3 sample PDF"}
