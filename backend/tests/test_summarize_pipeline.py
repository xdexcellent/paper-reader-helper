from pathlib import Path

from sqlmodel import Session, select

from app.core.db import engine
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.models.paper_summary import PaperSummary


def test_summarize_paper_extracts_sections_and_persists_summary(
    client, mocker, wait_for_task
) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Summary Me",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    parse_response = client.post(f"/papers/{paper_id}/parse")
    assert parse_response.status_code == 202
    parse_task = wait_for_task(client, parse_response.json()["task_id"])
    assert parse_task["status"] == "completed"

    mocker.patch(
        "app.services.deepseek_client.DeepSeekClient.summarize_sections",
        return_value={
            "one_line_summary": "这是一个视觉语言模型综述。",
            "core_contributions": "提出统一分类框架。",
            "method_summary": "按任务与架构组织方法。",
            "use_cases": "文献调研与路线梳理。",
            "limitations": "对最新工作覆盖有限。",
            "relevance_note": "适合做课题入门。",
            "model_name": "deepseek-chat",
            "prompt_version": "v1",
        },
    )

    response = client.post(f"/papers/{paper_id}/summarize")

    assert response.status_code == 202
    summary_task = wait_for_task(client, response.json()["task_id"])
    assert summary_task["status"] == "completed"
    with Session(engine) as session:
        paper = session.get(Paper, paper_id)
        content = session.exec(select(PaperContent).where(PaperContent.paper_id == paper_id)).one()
        summary = session.exec(select(PaperSummary).where(PaperSummary.paper_id == paper_id)).one()

    assert paper is not None
    assert paper.status == "ready"
    assert paper.summary_status == "completed"
    assert content.abstract_md != ""
    assert summary.one_line_summary == "这是一个视觉语言模型综述。"


def test_summarize_paper_returns_400_when_full_markdown_not_ready(client, tmp_path: Path) -> None:
    pdf_path = tmp_path / "summary-without-parse.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 no parse")

    create_response = client.post(
        "/papers/import",
        json={
            "title": "No Parse Yet",
            "source": "manual",
            "local_pdf_path": str(pdf_path),
        },
    )
    paper_id = create_response.json()["id"]

    response = client.post(f"/papers/{paper_id}/summarize")

    assert response.status_code == 400
    assert response.json() == {"detail": "论文尚未完成解析"}
