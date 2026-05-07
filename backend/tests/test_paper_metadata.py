from pathlib import Path

import pytest


def _create_paper(client, title: str = "Original Metadata Paper") -> int:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    response = client.post(
        "/papers/import",
        json={
            "title": title,
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_patch_paper_metadata_persists_and_returns_phase2_fields(client) -> None:
    paper_id = _create_paper(client)

    response = client.patch(
        f"/papers/{paper_id}",
        json={
            "title": "Updated Metadata",
            "source": "arxiv",
            "authors": "Ada Lovelace; Alan Turing",
            "abstract_raw": "Readable abstract.",
            "year": 2026,
            "venue": "ICLR",
            "doi": "10.1234/example",
            "url": "https://example.com/paper",
        },
    )

    body = response.json()
    assert response.status_code == 200, body
    assert body["title"] == "Updated Metadata"
    assert body["source"] == "arxiv"
    assert body["authors"] == "Ada Lovelace; Alan Turing"
    assert body["abstract_raw"] == "Readable abstract."
    assert body["year"] == 2026
    assert body["venue"] == "ICLR"
    assert body["doi"] == "10.1234/example"
    assert body["url"] == "https://example.com/paper"
    assert body["status"] == "queued"
    assert body["parse_status"] == "pending"
    assert body["summary_status"] == "pending"

    detail = client.get(f"/papers/{paper_id}").json()
    listed = client.get("/papers").json()[0]
    assert detail["authors"] == "Ada Lovelace; Alan Turing"
    assert detail["abstract_raw"] == "Readable abstract."
    assert detail["year"] == 2026
    assert listed["venue"] == "ICLR"
    assert listed["url"] == "https://example.com/paper"


def test_patch_paper_toggles_favorite(client) -> None:
    paper_id = _create_paper(client)

    favorite_response = client.patch(f"/papers/{paper_id}", json={"favorite": True})
    assert favorite_response.status_code == 200
    assert favorite_response.json()["favorite"] is True

    unfavorite_response = client.patch(f"/papers/{paper_id}", json={"favorite": False})
    assert unfavorite_response.status_code == 200
    assert unfavorite_response.json()["favorite"] is False


def test_patch_paper_updates_reading_state_and_progress(client) -> None:
    paper_id = _create_paper(client)

    response = client.patch(
        f"/papers/{paper_id}",
        json={"reading_status": "reading", "reading_progress": 45},
    )

    body = response.json()
    assert response.status_code == 200, body
    assert body["reading_status"] == "reading"
    assert body["reading_progress"] == 45


def test_patch_paper_saves_user_notes(client) -> None:
    paper_id = _create_paper(client)

    response = client.patch(
        f"/papers/{paper_id}",
        json={"user_notes": "Needs another pass before citation."},
    )

    body = response.json()
    assert response.status_code == 200, body
    assert body["user_notes"] == "Needs another pass before citation."
    assert client.get(f"/papers/{paper_id}").json()["user_notes"] == body["user_notes"]


@pytest.mark.parametrize(
    ("payload", "field_name"),
    [
        ({"reading_status": "archived"}, "reading_status"),
        ({"reading_progress": 101}, "reading_progress"),
        ({"year": 1499}, "year"),
        ({"url": "ftp://example.com/paper"}, "url"),
    ],
)
def test_patch_paper_rejects_invalid_metadata_payloads(client, payload, field_name) -> None:
    paper_id = _create_paper(client)

    response = client.patch(f"/papers/{paper_id}", json=payload)

    assert response.status_code == 422
    assert field_name in response.text


def test_patch_paper_preserves_legacy_query_update_compatibility(client) -> None:
    paper_id = _create_paper(client)

    response = client.patch(
        f"/papers/{paper_id}?title=Legacy%20Title&source=manual-legacy"
    )

    body = response.json()
    assert response.status_code == 200, body
    assert body["title"] == "Legacy Title"
    assert body["source"] == "manual-legacy"
