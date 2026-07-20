"""Unit tests for agent proposal safety policy helpers."""

from app.services.agent_policy import (
    classify_action_risk,
    is_batch_approvable_risk,
    prompt_requests_metadata_correction,
    sanitize_metadata_updates,
)


def test_prompt_requests_metadata_correction_detects_explicit_intent() -> None:
    assert prompt_requests_metadata_correction("请纠错这篇论文的标题和 DOI")
    assert prompt_requests_metadata_correction("Please correct the metadata title and year")
    assert prompt_requests_metadata_correction("请补全这篇论文的元数据")
    assert not prompt_requests_metadata_correction("帮我整理标签并收藏相关论文")
    assert not prompt_requests_metadata_correction("请修正分类并补全标签")
    assert not prompt_requests_metadata_correction("Please update the tags for these papers")


def test_sanitize_metadata_updates_gates_core_fields() -> None:
    raw = {
        "title": "New",
        "doi": "10.1/x",
        "favorite": True,
        "reading_status": "reading",
        "unknown": "drop-me",
    }

    blocked = sanitize_metadata_updates(raw, allow_core_metadata=False)
    assert blocked == {"favorite": True, "reading_status": "reading"}

    allowed = sanitize_metadata_updates(raw, allow_core_metadata=True)
    assert allowed == {
        "title": "New",
        "doi": "10.1/x",
        "favorite": True,
        "reading_status": "reading",
    }


def test_classify_action_risk_and_batch_policy() -> None:
    assert classify_action_risk("create_category") == "high"
    assert classify_action_risk("assign_category") == "medium"
    assert classify_action_risk("update_paper_metadata", {"favorite": True}) == "low"
    assert classify_action_risk("update_paper_metadata", {"title": "X"}) == "high"
    assert classify_action_risk("update_tags") == "low"

    assert is_batch_approvable_risk("low") is True
    assert is_batch_approvable_risk("medium") is False
    assert is_batch_approvable_risk("high") is False
