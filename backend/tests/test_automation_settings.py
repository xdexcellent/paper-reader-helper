from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, Session, create_engine, select

from app.core.db import engine
from app.models.automation_settings import AutomationSettings
from app.models.subscription import Subscription
from app.services.automation_settings_service import AutomationSettingsService


def test_get_automation_settings_bootstraps_singleton_record(client) -> None:
    with Session(engine) as session:
        assert session.exec(select(AutomationSettings)).all() == []

    response = client.get("/automation/settings")

    assert response.status_code == 200
    assert response.json() == {
        "enabled": True,
        "schedule_time": "12:00",
        "timezone": "Asia/Shanghai",
        "top_n": 5,
        "briefing_enabled": True,
        "project_sidebar_enabled": True,
    }

    with Session(engine) as session:
        rows = session.exec(select(AutomationSettings)).all()
        assert len(rows) == 1
        assert rows[0].schedule_time == "12:00"
        assert rows[0].top_n == 5

    second_response = client.get("/automation/settings")

    assert second_response.status_code == 200
    with Session(engine) as session:
        assert len(session.exec(select(AutomationSettings)).all()) == 1


def test_put_automation_settings_updates_schedule_top_n_and_sidebar_flag(client) -> None:
    response = client.put(
        "/automation/settings",
        json={
            "schedule_time": "08:30",
            "top_n": 10,
            "project_sidebar_enabled": False,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "enabled": True,
        "schedule_time": "08:30",
        "timezone": "Asia/Shanghai",
        "top_n": 10,
        "briefing_enabled": True,
        "project_sidebar_enabled": False,
    }

    with Session(engine) as session:
        settings = session.exec(select(AutomationSettings)).one()
        assert settings.schedule_time == "08:30"
        assert settings.top_n == 10
        assert settings.project_sidebar_enabled is False


def test_put_automation_settings_rejects_invalid_timezone(client) -> None:
    response = client.put(
        "/automation/settings",
        json={"timezone": "Mars/Olympus_Mons"},
    )

    assert response.status_code == 422
    assert "timezone" in response.text


def test_create_subscription_accepts_source_kind_config_and_fetch_limit(client) -> None:
    response = client.post(
        "/subscriptions",
        json={
            "name": "Vision Daily",
            "source_kind": "arxiv",
            "query": "cat:cs.CV",
            "display_name": "Computer Vision Daily",
            "config": {"sort": "submittedDate"},
            "fetch_limit": 7,
        },
    )

    assert response.status_code == 201
    assert response.json()["source_kind"] == "arxiv"
    assert response.json()["display_name"] == "Computer Vision Daily"
    assert response.json()["config"] == {"sort": "submittedDate"}
    assert response.json()["fetch_limit"] == 7
    assert response.json()["last_success_at"] is None
    assert response.json()["last_error"] is None

    list_response = client.get("/subscriptions")

    assert list_response.status_code == 200
    assert list_response.json()[0]["config"] == {"sort": "submittedDate"}
    assert list_response.json()[0]["fetch_limit"] == 7

    with Session(engine) as session:
        saved = session.exec(select(Subscription)).one()
        assert saved.source_kind == "arxiv"
        assert saved.display_name == "Computer Vision Daily"
        assert saved.fetch_limit == 7
        assert saved.config_json == '{"sort": "submittedDate"}'


def test_create_subscription_rejects_invalid_source_kind(client) -> None:
    response = client.post(
        "/subscriptions",
        json={
            "name": "Broken Source",
            "source_kind": "twitter",
            "query": "llm",
        },
    )

    assert response.status_code == 422
    assert "source_kind" in response.text


def test_create_subscription_accepts_config_only_sources_without_query(client) -> None:
    cases = [
        ("openreview", {"venue": "ICLR.cc/2026/Conference"}),
        ("hf_papers", {"url": "https://huggingface.co/papers"}),
        ("github_trending", {"language": "python", "since": "daily"}),
    ]

    for source_kind, config in cases:
        response = client.post(
            "/subscriptions",
            json={
                "name": f"{source_kind}-daily",
                "source_kind": source_kind,
                "config": config,
            },
        )

        assert response.status_code == 201
        assert response.json()["source_kind"] == source_kind
        assert response.json()["query"] == ""
        assert response.json()["config"] == config


def test_create_subscription_rejects_empty_query_for_known_sources(client) -> None:
    response = client.post(
        "/subscriptions",
        json={
            "name": "Broken Query",
            "source_kind": "arxiv",
            "query": "   ",
        },
    )

    assert response.status_code == 422
    assert "query" in response.text


def test_create_subscription_rejects_empty_query_for_rss(client) -> None:
    response = client.post(
        "/subscriptions",
        json={
            "name": "Broken RSS Query",
            "source_kind": "rss",
            "query": "   ",
        },
    )

    assert response.status_code == 422
    assert "query" in response.text


def test_create_subscription_rejects_mismatched_type_and_source_kind(client) -> None:
    response = client.post(
        "/subscriptions",
        json={
            "name": "Mismatched Source",
            "type": "arxiv",
            "source_kind": "rss",
            "query": "https://example.com/feed.xml",
        },
    )

    assert response.status_code == 422
    assert "source_kind" in response.text or "type" in response.text


def test_create_subscription_rejects_fetch_limit_above_cap(client) -> None:
    response = client.post(
        "/subscriptions",
        json={
            "name": "Too Many Results",
            "source_kind": "arxiv",
            "query": "cat:cs.LG",
            "fetch_limit": 99,
        },
    )

    assert response.status_code == 422
    assert "fetch_limit" in response.text


def test_get_automation_settings_recovers_from_concurrent_bootstrap(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "automation_settings_race.db"
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(test_engine)

    with Session(test_engine) as session:
        original_commit = session.commit
        race_triggered = {"done": False}

        def commit_with_race() -> None:
            if not race_triggered["done"]:
                race_triggered["done"] = True
                with Session(test_engine) as competing_session:
                    competing_session.add(AutomationSettings(id=1))
                    competing_session.commit()
                raise IntegrityError("INSERT", {}, Exception("duplicate key"))
            original_commit()

        monkeypatch.setattr(session, "commit", commit_with_race)

        settings = AutomationSettingsService.get_settings(session)

    assert settings.id == 1
    with Session(test_engine) as verify_session:
        assert len(verify_session.exec(select(AutomationSettings)).all()) == 1
