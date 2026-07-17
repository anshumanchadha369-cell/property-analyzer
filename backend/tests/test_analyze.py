import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import census, fema, hud, rentcast, usage
from app.services.base import SourceNotConfigured
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

HUD_FMR = {
    "year": 2026,
    "metroName": "Seattle-Bellevue, WA HUD Metro FMR Area",
    "smallArea": True,
    "rents": {"efficiency": 1500, "oneBr": 1700, "twoBr": 2050, "threeBr": 2900, "fourBr": 3400},
}

FLOOD_ZONE = {"floodZone": "X", "zoneSubtype": "AREA OF MINIMAL FLOOD HAZARD", "isHighRisk": False}

DEMOGRAPHICS = {
    "population": 41800,
    "medianHouseholdIncome": 61250,
    "medianGrossRent": 1290,
    "acsYear": 2023,
}

# The test property record has no coordinates unless included, so give it some
PROPERTY_RECORD["latitude"] = 47.6062
PROPERTY_RECORD["longitude"] = -122.3321


def _patch_sources(
    monkeypatch,
    prop=PROPERTY_RECORD,
    value=VALUE_ESTIMATE,
    rent=RENT_ESTIMATE,
    fmr=HUD_FMR,
    flood=FLOOD_ZONE,
    demo=DEMOGRAPHICS,
):
    def make(result):
        async def fake(*args, **kwargs):
            if isinstance(result, Exception):
                raise result
            return result

        return fake

    monkeypatch.setattr(rentcast, "get_property_records", make(prop))
    monkeypatch.setattr(rentcast, "get_value_estimate", make(value))
    monkeypatch.setattr(rentcast, "get_rent_estimate", make(rent))
    monkeypatch.setattr(hud, "get_fair_market_rents", make(fmr))
    monkeypatch.setattr(fema, "get_flood_zone", make(flood))
    monkeypatch.setattr(census, "get_demographics", make(demo))


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
    assert body["metrics"]["capRate"] == 0.0732
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


def test_mock_mode_spends_no_quota_and_is_flagged(monkeypatch):
    from app import config

    monkeypatch.setattr(config, "RENTCAST_BASE_URL", "http://localhost:9100")
    _patch_sources(monkeypatch)
    resp = client.post("/analyze", json={"address": "123 Test St, Seattle, WA 98101"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["usage"]["callsThisRequest"] == 0
    assert body["meta"]["usage"]["callsThisPeriod"] == 0
    assert body["meta"]["usage"]["mockMode"] is True

    usage_resp = client.get("/usage")
    assert usage_resp.json()["mockMode"] is True


def test_live_mode_not_flagged_as_mock(monkeypatch):
    _patch_sources(monkeypatch)
    resp = client.post("/analyze", json={"address": "123 Test St, Seattle, WA 98101"})
    assert resp.json()["meta"]["usage"]["mockMode"] is False
    assert client.get("/usage").json()["mockMode"] is False


def test_supplemental_sources_in_response(monkeypatch):
    _patch_sources(monkeypatch)
    body = client.post("/analyze", json={"address": "123 Test St, Seattle, WA 98101"}).json()

    assert body["marketRent"]["rents"]["twoBr"] == 2050
    assert body["risk"]["floodZone"] == "X"
    assert body["demographics"]["medianHouseholdIncome"] == 61250
    assert body["meta"]["sources"]["hud_fmr"]["status"] == "ok"
    assert body["meta"]["sources"]["hud_fmr"]["freshness"] == "annual"
    assert body["meta"]["sources"]["fema_flood"]["freshness"] == "live"
    assert body["meta"]["sources"]["census_acs"]["status"] == "ok"
    # Free sources are NOT billable — still exactly 3 RentCast calls
    assert body["meta"]["usage"]["callsThisRequest"] == 3


def test_not_configured_sources_reported_distinctly(monkeypatch):
    _patch_sources(
        monkeypatch,
        fmr=SourceNotConfigured("HUD_API_TOKEN is not set"),
        demo=SourceNotConfigured("CENSUS_API_KEY is not set"),
    )
    body = client.post("/analyze", json={"address": "123 Test St, Seattle, WA 98101"}).json()

    assert body["marketRent"] is None
    assert body["meta"]["sources"]["hud_fmr"]["status"] == "not_configured"
    assert body["meta"]["sources"]["census_acs"]["status"] == "not_configured"
    # Analysis and metrics unaffected
    assert body["meta"]["metricsAvailable"] is True
    assert body["meta"]["usage"]["callsThisRequest"] == 3


def test_address_without_zip_skips_zip_sources(monkeypatch):
    _patch_sources(monkeypatch)
    body = client.post("/analyze", json={"address": "123 Test St, Seattle"}).json()

    assert body["meta"]["sources"]["hud_fmr"]["status"] == "no_data"
    assert body["meta"]["sources"]["census_acs"]["status"] == "no_data"


def test_fema_error_degrades_gracefully(monkeypatch):
    _patch_sources(monkeypatch, flood=RuntimeError("arcgis down"))
    body = client.post("/analyze", json={"address": "123 Test St, Seattle, WA 98101"}).json()

    assert body["risk"] is None
    assert body["meta"]["sources"]["fema_flood"]["status"] == "error"
    assert body["meta"]["metricsAvailable"] is True
