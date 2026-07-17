import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app

client = TestClient(app)


@pytest.fixture
def gated(monkeypatch):
    monkeypatch.setattr(config, "APP_PASSWORD", "hunter2")


def test_health_stays_public_when_gated(gated):
    assert client.get("/health").status_code == 200


def test_protected_routes_reject_missing_key(gated):
    assert client.get("/usage").status_code == 401
    assert client.get("/analyses").status_code == 401
    assert client.post("/analyze", json={"address": "123 Main St, Kent, WA 98030"}).status_code == 401
    assert client.post("/parse-url", json={"url": "https://www.zillow.com/x"}).status_code == 401


def test_protected_routes_reject_wrong_key(gated):
    headers = {"X-App-Key": "wrong"}
    assert client.get("/usage", headers=headers).status_code == 401
    assert client.get("/analyses", headers=headers).status_code == 401


def test_correct_key_admits(gated):
    headers = {"X-App-Key": "hunter2"}
    assert client.get("/usage", headers=headers).status_code == 200
    body = client.get("/analyses", headers=headers).json()
    assert body["configured"] is False  # supabase not configured in tests


def test_open_when_password_unset():
    # config.APP_PASSWORD is "" by default in tests
    assert client.get("/usage").status_code == 200
    assert client.get("/analyses").status_code == 200
