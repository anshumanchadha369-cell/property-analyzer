import httpx
import pytest

from app import config
from app.services import census, fema, hud
from app.services.base import SourceNotConfigured


@pytest.fixture
def anyio_backend():
    return "asyncio"


# ---- HUD ----


def _hud_handler(fmr_payload, crosswalk_results=None):
    if crosswalk_results is None:
        crosswalk_results = [{"geoid": "53033", "res_ratio": 0.9}]

    def handler(request):
        assert request.headers["Authorization"] == "Bearer token"
        if request.url.path.endswith("/usps"):
            assert request.url.params["type"] == "2"
            return httpx.Response(200, json={"data": {"results": crosswalk_results}})
        assert request.url.path.endswith("/fmr/data/5303399999")
        return httpx.Response(200, json=fmr_payload)

    return handler


@pytest.mark.anyio
async def test_hud_parses_dict_basicdata(monkeypatch):
    monkeypatch.setattr(config, "HUD_API_TOKEN", "token")
    handler = _hud_handler(
        {
            "data": {
                "metro_name": "Tacoma-Lakewood",
                "smallarea_status": "1",
                "basicdata": {
                    "year": 2026,
                    "Efficiency": 1450,
                    "One-Bedroom": 1580,
                    "Two-Bedroom": 1890,
                    "Three-Bedroom": 2620,
                    "Four-Bedroom": 3110,
                },
            }
        }
    )
    monkeypatch.setattr(hud, "_transport", httpx.MockTransport(handler))
    result = await hud.get_fair_market_rents("98405")
    assert result["year"] == 2026
    assert result["rents"]["twoBr"] == 1890
    assert result["smallArea"] is True


@pytest.mark.anyio
async def test_hud_picks_matching_zip_row_from_safmr_list(monkeypatch):
    monkeypatch.setattr(config, "HUD_API_TOKEN", "token")
    handler = _hud_handler(
        {
            "data": {
                "metro_name": "Seattle-Bellevue",
                "smallarea_status": "1",
                "basicdata": [
                    {"zip_code": "98101", "year": 2026, "Two-Bedroom": 2600},
                    {"zip_code": "98030", "year": 2026, "Two-Bedroom": 2050},
                ],
            }
        }
    )
    monkeypatch.setattr(hud, "_transport", httpx.MockTransport(handler))
    result = await hud.get_fair_market_rents("98030")
    assert result["rents"]["twoBr"] == 2050


@pytest.mark.anyio
async def test_hud_crosswalk_prefers_highest_res_ratio(monkeypatch):
    monkeypatch.setattr(config, "HUD_API_TOKEN", "token")
    seen = {}

    def handler(request):
        if request.url.path.endswith("/usps"):
            return httpx.Response(
                200,
                json={
                    "data": {
                        "results": [
                            {"geoid": "53061", "res_ratio": 0.2},
                            {"geoid": "53033", "res_ratio": 0.8},
                        ]
                    }
                },
            )
        seen["entity"] = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(
            200, json={"data": {"basicdata": {"year": 2026, "Two-Bedroom": 2000}}}
        )

    monkeypatch.setattr(hud, "_transport", httpx.MockTransport(handler))
    await hud.get_fair_market_rents("98030")
    assert seen["entity"] == "5303399999"


@pytest.mark.anyio
async def test_hud_unknown_zip_is_no_data(monkeypatch):
    monkeypatch.setattr(config, "HUD_API_TOKEN", "token")

    def handler(request):
        return httpx.Response(200, json={"data": {"results": []}})

    monkeypatch.setattr(hud, "_transport", httpx.MockTransport(handler))
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
