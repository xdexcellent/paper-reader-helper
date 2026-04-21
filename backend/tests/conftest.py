import os
import shutil
import time
from collections.abc import Generator

import pytest
from sqlmodel import Session, create_engine

TEST_DB_DIR = "test-data"
TEST_DATABASE_URL = f"sqlite:///./{TEST_DB_DIR}/test.db"

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["APP_PASSWORD"] = ""
os.environ["JWT_SECRET"] = "paper-reader-test-secret"

from app.core.db import engine, get_session
from app.main import app


@pytest.fixture
def client() -> Generator:
    shutil.rmtree(TEST_DB_DIR, ignore_errors=True)
    if os.path.exists(TEST_DB_DIR):
        shutil.rmtree(TEST_DB_DIR, ignore_errors=True)
    os.makedirs(TEST_DB_DIR, exist_ok=True)

    with Session(engine) as session:
        from sqlmodel import SQLModel
        SQLModel.metadata.drop_all(engine)
        SQLModel.metadata.create_all(engine)

    def override_get_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    from fastapi.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    with Session(engine) as session:
        from sqlmodel import SQLModel
        SQLModel.metadata.drop_all(engine)
    shutil.rmtree(TEST_DB_DIR, ignore_errors=True)


def wait_for_task_completion(client, task_id: str, timeout: float = 2.0) -> dict:
    deadline = time.monotonic() + timeout
    last_body: dict = {}
    while time.monotonic() < deadline:
        response = client.get(f"/tasks/{task_id}")
        assert response.status_code == 200
        last_body = response.json()
        if last_body["status"] in {"completed", "failed"}:
            return last_body
        time.sleep(0.05)
    raise AssertionError(f"task {task_id} did not finish; last body={last_body}")


@pytest.fixture
def wait_for_task():
    return wait_for_task_completion
