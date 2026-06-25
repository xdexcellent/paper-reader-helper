import json

from app.api.routes import papers as papers_routes
from app.models.easyscholar_settings import EasyScholarSettings


def test_refresh_venue_ranks_starts_combined_backfill_flow(client, monkeypatch) -> None:
    client.put("/settings/easyscholar", json={"api_key": "key-test", "enabled": True})

    monkeypatch.setattr(
        papers_routes,
        "batch_backfill_missing_venues",
        lambda _session: {"total": 2, "resolved": 1, "no_source": 0, "no_match": 1, "error": 0},
    )
    monkeypatch.setattr(
        papers_routes,
        "batch_refresh_venue_ranks",
        lambda _session, _api_key: {"total": 1, "success": 1, "no_data": 0, "error": 0, "pending": 0, "stopped_reason": ""},
    )

    response = client.post("/papers/refresh-venue-ranks")
    assert response.status_code == 200
    body = response.json()
    assert "venue 补全" in body["message"]
    assert "missing_venues" in body
    assert "supported_missing_venues" in body


def test_venue_rank_status_returns_backfill_section(client) -> None:
    response = client.get("/papers/venue-ranks/status")
    assert response.status_code == 200
    body = response.json()
    assert "venue_backfill" in body
    assert "venue_rank" in body
    assert "stage" in body
    assert "running" in body


def test_backfill_venues_status_alias_matches_main_status(client) -> None:
    main_response = client.get("/papers/venue-ranks/status")
    alias_response = client.get("/papers/backfill-venues/status")

    assert main_response.status_code == 200
    assert alias_response.status_code == 200
    assert alias_response.json().keys() == main_response.json().keys()
