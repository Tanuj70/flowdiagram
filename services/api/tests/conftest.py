import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "t.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ["APP_ENV"] = "development"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, email, password):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture()
def admin(client):
    return login(client, "admin@example.com", "admin123")


@pytest.fixture()
def executor(client):
    return login(client, "executor@example.com", "executor123")


@pytest.fixture()
def viewer(client):
    return login(client, "viewer@example.com", "viewer123")
