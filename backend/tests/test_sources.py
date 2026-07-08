import httpx
import pytest

from app import config
from app.services import census, fema, hud
from app.services.base import SourceNotConfigured


@pytest.fixture
def anyio_backend():
    return "asyncio"


# ---- HUD ----


@pytest.mark.anyio
async def test_hud_parses_dict_basicdata(monkeypatch):
    monkeypatch.setattr(config, "HUD_API_TOKEN", "token")

    def handler(request):
        assert request.headers["Authorization"] == "Bearer token"
        assert request.url.path.endswith("/fmr/data/98405")
        return httpx.Response(
            200,
            json={
                "data": {
                    "metro_name": "Tacoma-Lakewood",
                    "smallarea_status": 1,
                    "basicdata": {
                        "year": 2026,
                        "Efficiency": 1450,
                        "One-Bedroom": 1580,
                        "Two-Bedroom": 1890,
                        "Three-Bedroom": 2620,
                        "Four-Bedroom": 3110,
                    },
                }
            },
        )

    monkeypatch.setattr(hud, "_transport", httpx.MockTransport(handler))
    result = await hud.get_fair_market_rents("98405")
    assert result["year"] == 2026
    assert result["rents"]["twoBr"] == 1890
    assert result["smallArea"] is True


@pytest.mark.anyio
async def test_hud_parses_list_basicdata(monkeypatch):
    monkeypatch.setattr(config, "HUD_API_TOKEN", "token")

    def handler(request):
        return httpx.Response(
            200,
            json={"data": {"basicdata": [{"year": 2026, "Two-Bedroom": 2000}]}},
        )

    monkeypatch.setattr(hud, "_transport", httpx.MockTransport(handler))
    result = await hud.get_fair_market_rents("98405")
    assert result["rents"]["twoBr"] == 2000
    assert result["rents"]["oneBr"] is None


@pytest.mark.anyio
async def test_hud_404_is_no_data(monkeypatch):
    monkeypatch.setattr(config, "HUD_API_TOKEN", "token")
    monkeypatch.setattr(
        hud, "_transport", httpx.MockTransport(lambda r: httpx.Response(404))
    )
    assert await hud.get_fair_market_rents("00000") is None


@pytest.mark.anyio
async def test_hud_without_token_raises_not_configured(monkeypatch):
    monkeypatch.setattr(config, "HUD_API_TOKEN", "")
    with pytest.raises(SourceNotConfigured):
        await hud.get_fair_market_rents("98405")


# ---- FEMA ----


@pytest.mark.anyio
async def test_fema_low_risk_zone(monkeypatch):
    def handler(request):
        assert request.url.params["geometryType"] == "esriGeometryPoint"
        return httpx.Response(
            200,
            json={"features": [{"attributes": {"FLD_ZONE": "X", "ZONE_SUBTY": "MINIMAL"}}]},
        )

    monkeypatch.setattr(fema, "_transport", httpx.MockTransport(handler))
    result = await fema.get_flood_zone(47.24, -122.44)
    assert result == {"floodZone": "X", "zoneSubtype": "MINIMAL", "isHighRisk": False}


@pytest.mark.anyio
async def test_fema_high_risk_zone(monkeypatch):
    def handler(request):
        return httpx.Response(
            200, json={"features": [{"attributes": {"FLD_ZONE": "AE", "ZONE_SUBTY": None}}]}
        )

    monkeypatch.setattr(fema, "_transport", httpx.MockTransport(handler))
    result = await fema.get_flood_zone(47.24, -122.44)
    assert result["isHighRisk"] is True


@pytest.mark.anyio
async def test_fema_no_features_is_no_data(monkeypatch):
    monkeypatch.setattr(
        fema, "_transport", httpx.MockTransport(lambda r: httpx.Response(200, json={"features": []}))
    )
    assert await fema.get_flood_zone(47.24, -122.44) is None


@pytest.mark.anyio
async def test_fema_service_error_raises(monkeypatch):
    monkeypatch.setattr(
        fema,
        "_transport",
        httpx.MockTransport(
            lambda r: httpx.Response(200, json={"error": {"code": 400, "message": "bad"}})
        ),
    )
    with pytest.raises(fema.FemaError):
        await fema.get_flood_zone(47.24, -122.44)


# ---- Census ----


@pytest.mark.anyio
async def test_census_parses_row(monkeypatch):
    monkeypatch.setattr(config, "CENSUS_API_KEY", "key")

    def handler(request):
        assert request.url.params["key"] == "key"
        return httpx.Response(
            200,
            json=[
                ["NAME", "B01003_001E", "B19013_001E", "B25064_001E", "zip code tabulation area"],
                ["ZCTA5 98405", "41800", "61250", "1290", "98405"],
            ],
        )

    monkeypatch.setattr(census, "_transport", httpx.MockTransport(handler))
    result = await census.get_demographics("98405")
    assert result == {
        "population": 41800,
        "medianHouseholdIncome": 61250,
        "medianGrossRent": 1290,
        "acsYear": 2023,
    }


@pytest.mark.anyio
async def test_census_negative_sentinel_becomes_none(monkeypatch):
    monkeypatch.setattr(config, "CENSUS_API_KEY", "key")

    def handler(request):
        return httpx.Response(
            200,
            json=[
                ["NAME", "B01003_001E", "B19013_001E", "B25064_001E", "zip code tabulation area"],
                ["ZCTA5 00000", "500", "-666666666", "1290", "00000"],
            ],
        )

    monkeypatch.setattr(census, "_transport", httpx.MockTransport(handler))
    result = await census.get_demographics("00000")
    assert result["medianHouseholdIncome"] is None
    assert result["population"] == 500


@pytest.mark.anyio
async def test_census_204_is_no_data(monkeypatch):
    monkeypatch.setattr(config, "CENSUS_API_KEY", "key")
    monkeypatch.setattr(
        census, "_transport", httpx.MockTransport(lambda r: httpx.Response(204))
    )
    assert await census.get_demographics("99999") is None


@pytest.mark.anyio
async def test_census_without_key_raises_not_configured(monkeypatch):
    monkeypatch.setattr(config, "CENSUS_API_KEY", "")
    with pytest.raises(SourceNotConfigured):
        await census.get_demographics("98405")
