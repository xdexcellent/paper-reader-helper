from pathlib import Path


def test_list_and_detail_endpoints_return_reader_data(client, mocker, wait_for_task) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_response = client.post(
        "/papers/import",
        json={
            "title": "Reader Ready",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        return_value={
            "full_markdown": "# Reader Ready\n\n## Abstract\nA readable abstract.\n\n## Introduction\nIntro text.\n\n## Methods\nMethod text.\n\n## Conclusion\nConclusion text.",
            "content_json_path": "data/storage/mineru/content.json",
            "full_zip_path": "data/storage/mineru/full.zip",
        },
    )

    parse_response = client.post(f"/papers/{paper_id}/parse")
    assert parse_response.status_code == 202
    parse_task = wait_for_task(client, parse_response.json()["task_id"])
    assert parse_task["status"] == "completed"
    mocker.patch(
        "app.services.deepseek_client.DeepSeekClient.summarize_sections",
        return_value={
            "one_line_summary": "一句话摘要",
            "core_contributions": "核心贡献",
            "method_summary": "方法概述",
            "use_cases": "应用场景",
            "limitations": "局限性",
            "relevance_note": "相关性",
            "model_name": "deepseek-chat",
            "prompt_version": "v1",
        },
    )
    summary_response = client.post(f"/papers/{paper_id}/summarize")
    assert summary_response.status_code == 202
    summary_task = wait_for_task(client, summary_response.json()["task_id"])
    assert summary_task["status"] == "completed"

    list_response = client.get("/papers")
    detail_response = client.get(f"/papers/{paper_id}")

    assert list_response.status_code == 200
    assert list_response.json()[0]["title"] == "Reader Ready"
    assert detail_response.status_code == 200
    assert detail_response.json()["one_line_summary"] == "一句话摘要"
    assert detail_response.json()["full_markdown"].startswith("#")
