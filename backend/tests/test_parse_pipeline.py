import threading
import time
import zipfile
from pathlib import Path

from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.models.paper_embedding import PaperEmbedding
from app.models.paper import Paper
from app.models.paper_block import PaperBlock
from app.models.paper_content import PaperContent
from app.models.paper_summary import PaperSummary
from app.services.task_queue import BackgroundTaskQueue


def _clear_task_queue() -> None:
    queue = BackgroundTaskQueue()
    with queue._lock:
        queue._tasks.clear()


def test_parse_paper_updates_content_and_status(client, mocker, wait_for_task) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Parse Me",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        return_value={
            "full_markdown": "# Title\n\n## Abstract\nHello world",
            "content_json_path": "data/storage/mineru/content.json",
            "full_zip_path": "data/storage/mineru/full.zip",
        },
    )

    response = client.post(f"/papers/{paper_id}/parse")

    assert response.status_code == 202
    task_body = wait_for_task(client, response.json()["task_id"])
    assert task_body["status"] == "completed"

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper_id)
        ).one()

    assert paper is not None
    assert paper.parse_status == "completed"
    assert paper.status == "parsed"
    assert content.full_markdown == "# Title\n\n## Abstract\nHello world"


def test_parse_route_rejects_duplicate_submission_while_processing(client) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Already Parsing",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        assert paper is not None
        paper.status = "parsing"
        paper.parse_status = "processing"
        session.add(paper)
        session.commit()

    _clear_task_queue()
    blocker = threading.Event()
    queue = BackgroundTaskQueue()
    queue.submit("parse", blocker.wait, paper_id=paper_id)

    try:
        response = client.post(f"/papers/{paper_id}/parse")
    finally:
        blocker.set()
        time.sleep(0.05)
        _clear_task_queue()

    assert response.status_code == 409
    assert response.json()["detail"]


def test_get_paper_recovers_stale_parse_processing_state(client) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Stale Parse Status",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    _clear_task_queue()
    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        assert paper is not None
        paper.status = "parsing"
        paper.parse_status = "processing"
        session.add(paper)
        session.commit()

    response = client.get(f"/papers/{paper_id}")

    assert response.status_code == 200
    assert response.json()["status"] == "parse_failed"
    assert response.json()["parse_status"] == "failed"

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)

    assert paper is not None
    assert paper.status == "parse_failed"
    assert paper.parse_status == "failed"


def test_parse_route_restarts_stale_parse_processing_state(
    client, mocker, wait_for_task
) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Restart Stale Parse",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    _clear_task_queue()
    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        assert paper is not None
        paper.status = "parsing"
        paper.parse_status = "processing"
        session.add(paper)
        session.commit()

    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        return_value={
            "full_markdown": "# Recovered\n\n## Abstract\nRetry works",
            "content_json_path": "data/storage/mineru/content.json",
            "full_zip_path": "data/storage/mineru/full.zip",
        },
    )

    response = client.post(f"/papers/{paper_id}/parse")

    assert response.status_code == 202
    task_body = wait_for_task(client, response.json()["task_id"])
    assert task_body["status"] == "completed"

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)

    assert paper is not None
    assert paper.status == "parsed"
    assert paper.parse_status == "completed"


def test_reparse_invalidates_stale_derived_artifacts(
    client, mocker, wait_for_task
) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Reparse Invalidates Derived Data",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        assert paper is not None
        paper.summary_status = "completed"
        paper.embedding_status = "completed"
        session.add(paper)

        content = PaperContent(
            paper_id=paper_id,
            full_markdown="# Old\n\n## Abstract\nOld content",
            abstract_md="## Abstract\n\nOld placeholder abstract",
            introduction_md="Old intro",
            method_md="Old method",
            conclusion_md="Old conclusion",
            content_json_path="old.json",
            full_zip_path="old.zip",
        )
        summary = PaperSummary(
            paper_id=paper_id,
            one_line_summary="Old summary",
            core_contributions="Old contributions",
            method_summary="Old method summary",
            use_cases="Old use cases",
            limitations="Old limitations",
            relevance_note="Old relevance",
        )
        embedding = PaperEmbedding(
            paper_id=paper_id,
            embedding_json="[0.1, 0.2, 0.3]",
        )
        session.add(content)
        session.add(summary)
        session.add(embedding)
        session.commit()

    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        return_value={
            "full_markdown": "# Fresh Parse\n\n## Abstract\nFresh content",
            "content_json_path": "data/storage/mineru/new-content.json",
            "full_zip_path": "data/storage/mineru/new-full.zip",
        },
    )

    response = client.post(f"/papers/{paper_id}/parse")

    assert response.status_code == 202
    task_body = wait_for_task(client, response.json()["task_id"])
    assert task_body["status"] == "completed"

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper_id)
        ).one()
        summary = session.exec(
            select(PaperSummary).where(PaperSummary.paper_id == paper_id)
        ).first()
        embedding = session.exec(
            select(PaperEmbedding).where(PaperEmbedding.paper_id == paper_id)
        ).first()

    assert paper is not None
    assert paper.status == "parsed"
    assert paper.parse_status == "completed"
    assert paper.summary_status == "pending"
    assert paper.embedding_status == "pending"
    assert content.full_markdown == "# Fresh Parse\n\n## Abstract\nFresh content"
    assert content.abstract_md == ""
    assert content.introduction_md == ""
    assert content.method_md == ""
    assert content.conclusion_md == ""
    assert content.content_json_path == "data/storage/mineru/new-content.json"
    assert content.full_zip_path == "data/storage/mineru/new-full.zip"
    assert summary is None
    assert embedding is None


def test_parse_paper_persists_blocks_from_structured_artifact(
    client, mocker, wait_for_task, tmp_path
) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    content_json = tmp_path / "paper_content_list.json"
    content_json.write_text(
        '[{"type":"text","text":"Parsed block","bbox":[1,2,3,4],"page_idx":0}]',
        encoding="utf-8",
    )
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Parse Blocks",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        return_value={
            "full_markdown": "# Blocks\n\nParsed markdown",
            "content_json_path": str(content_json),
            "full_zip_path": "",
        },
    )

    response = client.post(f"/papers/{paper_id}/parse")

    assert response.status_code == 202
    task_body = wait_for_task(client, response.json()["task_id"])
    assert task_body["status"] == "completed"

    with Session(engine) as session:
        blocks = session.exec(
            select(PaperBlock).where(PaperBlock.paper_id == paper_id)
        ).all()

    assert len(blocks) == 1
    assert blocks[0].text == "Parsed block"
    assert blocks[0].block_index == 0


def test_parse_paper_persists_representative_image_url(
    client, mocker, wait_for_task, tmp_path
) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    zip_path = tmp_path / "mineru_result.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr(
            "paper_content_list.json",
            (
                '[{"type":"image","image_caption":["Figure 1. Overview."],'
                '"img_path":"images/figure-1.jpg","bbox":[1,2,501,402],"page_idx":1}]'
            ),
        )
        archive.writestr("images/figure-1.jpg", b"representative")

    create_response = client.post(
        "/papers/import",
        json={
            "title": "Representative Image",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        return_value={
            "full_markdown": "# Image\n\nParsed markdown",
            "content_json_path": "",
            "full_zip_path": str(zip_path),
        },
    )

    response = client.post(f"/papers/{paper_id}/parse")

    assert response.status_code == 202
    task_body = wait_for_task(client, response.json()["task_id"])
    assert task_body["status"] == "completed"

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        blocks = session.exec(
            select(PaperBlock).where(PaperBlock.paper_id == paper_id)
        ).all()

    assert paper is not None
    assert paper.representative_image_path
    assert Path(paper.representative_image_path).read_bytes() == b"representative"
    assert blocks[0].asset_path == "images/figure-1.jpg"

    list_response = client.get("/papers")
    listed = next(item for item in list_response.json() if item["id"] == paper_id)
    assert listed["representative_image_url"].startswith(
        f"{settings.server_base_url.rstrip('/')}/files/papers/"
    )
    assert listed["representative_image_url"].endswith(".jpg")


def test_parse_paper_keeps_success_when_block_extraction_fails(
    client, mocker, wait_for_task, tmp_path
) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    content_json = tmp_path / "paper_content_list.json"
    content_json.write_text("[]", encoding="utf-8")
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Recoverable Block Failure",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        return_value={
            "full_markdown": "# Blocks\n\nMarkdown survives",
            "content_json_path": str(content_json),
            "full_zip_path": "",
        },
    )
    mocker.patch(
        "app.services.block_extraction_service.BlockExtractionService.rebuild_blocks",
        side_effect=RuntimeError("broken structured artifact"),
    )

    response = client.post(f"/papers/{paper_id}/parse")

    assert response.status_code == 202
    task_body = wait_for_task(client, response.json()["task_id"])
    assert task_body["status"] == "completed"

    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper_id)
        ).one()
        blocks = session.exec(
            select(PaperBlock).where(PaperBlock.paper_id == paper_id)
        ).all()

    assert paper is not None
    assert paper.status == "parsed"
    assert paper.parse_status == "completed"
    assert content.full_markdown == "# Blocks\n\nMarkdown survives"
    assert blocks == []
