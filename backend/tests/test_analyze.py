import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import rentcast, usage
from app.services.rentcast import RentCastError

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_usage_tally():
    usage.reset_for_tests()
    yield
    usage.reset_for_tests()

PROPERTY_RECORD = {
    "formattedAddress": "123 Test St, Seattle, WA 98101",
    "propertyType": "Multi-Family",
    "bedrooms": 8,
    "bathrooms": 4,
    "squareFootage": 3600,
    "lotSize": 5000,
    "yearBuilt": 1968,
    "features": {"unitCount": 4},
    "propertyTaxes": {"2024": {"total": 4500}, "2025": {"total": 4800}},
    "lastSalePrice": 310_000,
    "lastSaleDate": "2019-05-01T00:00:00.000Z",
}

VALUE_ESTIMATE = {
    "price": 400_000,
    "priceRangeLow": 380_000,
    "priceRangeHigh": 420_000,
    "comparables": [
        {"formattedAddress": f"Comp {i}", "price": 390_000 + i, "correlation": 0.9}
        for i in range(8)
    ],
}

RENT_ESTIMATE = {
    "rent": 4000,
    "rentRangeLow": 3800,
    "rentRangeHigh": 4200,
    "comparables": [],
}


def _patch_sources(monkeypatch, prop=PROPERTY_RECORD, value=VALUE_ESTIMATE, rent=RENT_ESTIMATE):
    def make(result):
        async def fake(address):
            if isinstance(result, Exception):
                raise result
            return result

        return fake

    monkeypatch.setattr(rentcast, "get_property_records", make(prop))
    monkeypatch.setattr(rentcast, "get_value_estimate", make(value))
    monkeypatch.setattr(rentcast, "get_rent_estimate", make(rent))


def test_analyze_success(monkeypatch):
    _patch_sources(monkeypatch)
    resp = client.post("/analyze", json={"address": "123 Test St, Seattle, WA 98101"})
    assert resp.status_code == 200
    body = resp.json()

    assert body["property"]["unitCount"] == 4
    assert body["valuation"]["value"] == 400_000
    assert len(body["valuation"]["comparables"]) == 5  # trimmed
    assert body["rental"]["rent"] == 4000

    # Uses the latest tax year (2025: 4800)
    assert body["metrics"]["operatingExpenses"]["propertyTaxes"] == 4800
    assert body["metrics"]["operatingExpenses"]["taxesEstimated"] is False
    assert body["metrics"]["capRate"] == 0.0742
    assert body["meta"]["metricsAvailable"] is True
    assert all(s["status"] == "ok" for s in body["meta"]["sources"].values())
    # All three sources succeeded → 3 billable calls tracked
    assert body["meta"]["usage"]["callsThisRequest"] == 3
    assert body["meta"]["usage"]["callsThisPeriod"] == 3
    assert body["meta"]["usage"]["quota"] == 50


def test_analyze_rent_error_degrades_gracefully(monkeypatch):
    _patch_sources(monkeypatch, rent=RentCastError("upstream boom", status_code=500))
    resp = client.post("/analyze", json={"address": "123 Test St, Seattle, WA 98101"})
    assert resp.status_code == 200
    body = resp.json()

    assert body["rental"] is None
    assert body["meta"]["sources"]["rentcast_rent"]["status"] == "error"
    assert body["metrics"] is None
    assert body["meta"]["metricsAvailable"] is False
    assert "rent estimate" in body["meta"]["metricsUnavailableReason"]
    # Other sections still present
    assert body["property"] is not None
    assert body["valuation"] is not None
    # Errored call doesn't count against quota; the two successes do
    assert body["meta"]["usage"]["callsThisRequest"] == 2


def test_analyze_missing_property_still_computes_metrics(monkeypatch):
    _patch_sources(monkeypatch, prop=None)
    resp = client.post("/analyze", json={"address": "123 Test St, Seattle, WA 98101"})
    assert resp.status_code == 200
    body = resp.json()

    assert body["property"] is None
    assert body["meta"]["sources"]["rentcast_property"]["status"] == "no_data"
    # Metrics computed from value + rent alone, with estimated taxes
    assert body["meta"]["metricsAvailable"] is True
    assert body["metrics"]["operatingExpenses"]["taxesEstimated"] is True


def test_analyze_rejects_too_short_address():
    resp = client.post("/analyze", json={"address": "abc"})
    assert resp.status_code == 422
