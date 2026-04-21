from pathlib import Path


def test_categories_endpoint_bootstraps_default_directories(client) -> None:
    response = client.get("/categories")

    assert response.status_code == 200
    payload = response.json()
    names = [item["name"] for item in payload]

    assert names[0] == "待确认"
    assert "强化学习" in names
    assert "物理信息机器学习" in names

    pending_bucket = next(item for item in payload if item["is_pending_bucket"])
    assert pending_bucket["name"] == "待确认"
    assert pending_bucket["paper_count"] == 0


def test_summarize_pipeline_assigns_controlled_primary_category(client, mocker, wait_for_task) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    category_payload = client.get("/categories").json()
    rl_category = next(item for item in category_payload if item["name"] == "强化学习")

    create_response = client.post(
        "/papers/import",
        json={
            "title": "Physics Olympiad RL",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    mocker.patch(
        "app.services.mineru_client.MineruClient.parse_pdf",
        return_value={
            "full_markdown": "# Physics Olympiad RL\n\n## Abstract\nRL for physics simulators",
            "content_json_path": "data/storage/mineru/content.json",
            "full_zip_path": "data/storage/mineru/full.zip",
        },
    )
    parse_response = client.post(f"/papers/{paper_id}/parse")
    assert parse_response.status_code == 202
    assert wait_for_task(client, parse_response.json()["task_id"])["status"] == "completed"

    mocker.patch(
        "app.services.deepseek_client.DeepSeekClient.summarize_sections",
        return_value={
            "one_line_summary": "This paper applies reinforcement learning to physics simulators.",
            "core_contributions": "A physics olympiad benchmark with RL agents.",
            "method_summary": "Policy optimization over simulator environments.",
            "use_cases": "Scientific discovery and tutoring.",
            "limitations": "Needs high-quality simulators.",
            "relevance_note": "Useful for scientific AI workflows.",
            "model_name": "deepseek-chat",
            "prompt_version": "v1",
        },
    )

    def fake_auto_tag(self, session, paper, summary) -> None:
        paper.tags = ["强化学习", "物理模拟", "科学推理"]
        session.add(paper)
        session.commit()
        session.refresh(paper)

    mocker.patch("app.services.pipeline.PaperPipelineService.auto_tag", new=fake_auto_tag)
    mocker.patch("app.services.pipeline.PaperPipelineService.generate_embedding", return_value=None)
    mocker.patch(
        "app.services.category_classifier.CategoryClassifier.classify",
        return_value={
            "primary_category_id": rl_category["id"],
            "confidence": 0.93,
            "status": "auto_confirmed",
            "reason": "Matched reinforcement learning and simulator signals.",
        },
    )

    summarize_response = client.post(f"/papers/{paper_id}/summarize")
    assert summarize_response.status_code == 202
    assert wait_for_task(client, summarize_response.json()["task_id"])["status"] == "completed"

    paper_payload = client.get(f"/papers/{paper_id}").json()
    list_payload = client.get("/papers").json()

    assert paper_payload["primary_category_id"] == rl_category["id"]
    assert paper_payload["category_status"] == "auto_confirmed"
    assert paper_payload["category_confidence"] == 0.93
    assert paper_payload["tags"] == ["强化学习", "物理模拟", "科学推理"]
    assert list_payload[0]["primary_category_id"] == rl_category["id"]


def test_manual_category_update_moves_paper_and_locks_classification(client) -> None:
    sample_pdf = Path(__file__).parent / "fixtures" / "sample.pdf"
    create_category_response = client.post(
        "/categories",
        json={"name": "我的专题", "description": "Manual research bucket"},
    )
    assert create_category_response.status_code == 201
    custom_category = create_category_response.json()

    create_response = client.post(
        "/papers/import",
        json={
            "title": "Needs Review",
            "source": "manual",
            "local_pdf_path": str(sample_pdf),
        },
    )
    paper_id = create_response.json()["id"]

    update_response = client.put(
        f"/papers/{paper_id}/category",
        json={"primary_category_id": custom_category["id"]},
    )

    assert update_response.status_code == 200
    payload = update_response.json()
    assert payload["primary_category_id"] == custom_category["id"]
    assert payload["category_status"] == "manual_locked"
    assert payload["category_confidence"] == 1.0

    category_payload = client.get("/categories").json()
    custom_with_counts = next(item for item in category_payload if item["id"] == custom_category["id"])
    pending_bucket = next(item for item in category_payload if item["is_pending_bucket"])

    assert custom_with_counts["paper_count"] == 1
    assert pending_bucket["paper_count"] == 0
