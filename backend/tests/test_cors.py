from fastapi.testclient import TestClient


ALLOWED_ORIGIN = "http://localhost:3000"


def test_cors_preflight_allows_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/papers",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
