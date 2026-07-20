from sqlmodel import Session, select

from app.core.db import engine
from app.models.spis_settings import SpisSettings


def test_get_spis_settings_bootstraps_disabled_masked_response(client) -> None:
    response = client.get("/automation/spis-settings")

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "account_set": False,
        "account_preview": "",
        "password_set": False,
        "password_preview": "",
        "enabled": False,
    }
    assert "account" not in payload
    assert "password" not in payload

    with Session(engine) as session:
        rows = session.exec(select(SpisSettings)).all()
        assert len(rows) == 1
        assert rows[0].enabled is False


def test_put_spis_settings_persists_secrets_and_keeps_masked_values(client) -> None:
    response = client.put(
        "/automation/spis-settings",
        json={
            "account": "campus-user",
            "password": "s3cret-pass",
            "enabled": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["account_set"] is True
    assert payload["password_set"] is True
    assert payload["enabled"] is True
    assert "••••" in payload["account_preview"]
    assert payload["password_preview"] == "••••••••"
    assert "account" not in payload
    assert "password" not in payload

    with Session(engine) as session:
        row = session.get(SpisSettings, 1)
        assert row is not None
        assert row.account == "campus-user"
        assert row.password == "s3cret-pass"
        assert row.enabled is True

    masked = client.put(
        "/automation/spis-settings",
        json={
            "account": payload["account_preview"],
            "password": "••••••••",
            "enabled": False,
        },
    )
    assert masked.status_code == 200
    assert masked.json()["enabled"] is False

    with Session(engine) as session:
        row = session.get(SpisSettings, 1)
        assert row is not None
        assert row.account == "campus-user"
        assert row.password == "s3cret-pass"
        assert row.enabled is False
