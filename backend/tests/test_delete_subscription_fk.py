"""Regression tests for deleting subscriptions when IngestionItem records reference them."""

import json
from datetime import date, datetime, timezone

from sqlmodel import Session, select

from app.core.db import engine
from app.models.daily_run import DailyRun
from app.models.ingestion_item import IngestionItem
from app.models.subscription import Subscription


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def test_delete_subscription_nullifies_ingestion_item_references(client) -> None:
    # 创建订阅
    create_res = client.post(
        "/subscriptions",
        json={"name": "To Be Deleted", "source_kind": "arxiv", "query": "cat:cs.LG"},
    )
    assert create_res.status_code == 201
    sub_id = create_res.json()["id"]

    # 在 DB 里造一个 DailyRun + 引用该订阅的 IngestionItem
    with Session(engine) as session:
        run = DailyRun(
            run_date=date.today(),
            scheduled_for=_utcnow(),
            started_at=_utcnow(),
            status="completed",
            trigger_type="manual",
            stats_json=json.dumps({}),
        )
        session.add(run)
        session.commit()
        session.refresh(run)

        item = IngestionItem(
            daily_run_id=run.id,
            subscription_id=sub_id,
            source_kind="arxiv",
            artifact_type="paper",
            external_id="test-1",
            title="Some Paper",
            fingerprint="fp-1",
            metadata_json="{}",
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        item_id = item.id

    # 删除订阅应成功，且 IngestionItem.subscription_id 被置空
    delete_res = client.delete(f"/subscriptions/{sub_id}")
    assert delete_res.status_code == 200
    assert delete_res.json() == {"success": True}

    with Session(engine) as session:
        assert session.get(Subscription, sub_id) is None
        preserved = session.get(IngestionItem, item_id)
        assert preserved is not None
        assert preserved.subscription_id is None
        assert preserved.title == "Some Paper"  # 历史数据保留


def test_delete_subscription_without_items_succeeds(client) -> None:
    create_res = client.post(
        "/subscriptions",
        json={"name": "No History", "source_kind": "arxiv", "query": "cat:cs.AI"},
    )
    sub_id = create_res.json()["id"]

    delete_res = client.delete(f"/subscriptions/{sub_id}")
    assert delete_res.status_code == 200

    with Session(engine) as session:
        assert session.get(Subscription, sub_id) is None


def test_delete_subscription_returns_404_for_missing_id(client) -> None:
    response = client.delete("/subscriptions/9999")
    assert response.status_code == 404
