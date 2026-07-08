import httpx
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import supabase_store as store

client = TestClient(app)

RECORD = {
    "id": "11111111-2222-3333-4444-555555555555",
    "address": "123 Test St, Seattle, WA",
    "savedAt": "2026-07-08T20:00:00Z",
    "updatedAt": "2026-07-08T20:05:00Z",
    "payload": {"result": {"metrics": None}, "overrides": {}, "settings": {}},
}


def _configure(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(config, "SUPABASE_SERVICE_KEY", "service-key")


def test_unconfigured_get_reports_local_only():
    body = client.get("/analyses").json()
    assert body == {"configured": False, "records": []}


def test_unconfigured_put_and_delete_do_not_fail():
    put = client.put(f"/analyses/{RECORD['id']}", json=RECORD).json()
    assert put == {"configured": False, "synced": False}
    delete = client.delete(f"/analyses/{RECORD['id']}").json()
    assert delete == {"configured": False, "synced": False}


def test_put_id_mismatch_rejected(monkeypatch):
    _configure(monkeypatch)
    body = client.put("/analyses/other-id-123", json=RECORD).json()
    assert body["synced"] is False
    assert "mismatch" in body["error"]


def test_get_maps_rows_to_camel_case(monkeypatch):
    _configure(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["apikey"] == "service-key"
        assert request.url.path == "/rest/v1/analyses"
        return httpx.Response(
            200,
            json=[
                {
                    "id": RECORD["id"],
                    "address": RECORD["address"],
                    "saved_at": RECORD["savedAt"],
                    "updated_at": RECORD["updatedAt"],
                    "payload": RECORD["payload"],
                }
            ],
        )

    monkeypatch.setattr(store, "_transport", httpx.MockTransport(handler))
    body = client.get("/analyses").json()
    assert body["configured"] is True
    assert body["records"][0]["savedAt"] == RECORD["savedAt"]
    assert body["records"][0]["payload"] == RECORD["payload"]


def test_put_upserts_with_merge_duplicates(monkeypatch):
    _configure(monkeypatch)
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["prefer"] = request.headers.get("Prefer")
        captured["method"] = request.method
        return httpx.Response(201, json={})

    monkeypatch.setattr(store, "_transport", httpx.MockTransport(handler))
    body = client.put(f"/analyses/{RECORD['id']}", json=RECORD).json()
    assert body == {"configured": True, "synced": True}
    assert captured["method"] == "POST"
    assert captured["prefer"] == "resolution=merge-duplicates"


def test_delete_targets_row_by_id(monkeypatch):
    _configure(monkeypatch)
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["params"] = dict(request.url.params)
        captured["method"] = request.method
        return httpx.Response(204)

    monkeypatch.setattr(store, "_transport", httpx.MockTransport(handler))
    body = client.delete(f"/analyses/{RECORD['id']}").json()
    assert body == {"configured": True, "synced": True}
    assert captured["method"] == "DELETE"
    assert captured["params"]["id"] == f"eq.{RECORD['id']}"


def test_supabase_error_reported_not_raised(monkeypatch):
    _configure(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    monkeypatch.setattr(store, "_transport", httpx.MockTransport(handler))
    body = client.get("/analyses").json()
    assert body["configured"] is True
    assert body["records"] == []
    assert "500" in body["error"]
