"""HUD Fair Market Rents (FMR) client — free official API, annual data.

FMRs are 40th-percentile gross rents; a useful sanity check against the
RentCast rent AVM. Token signup: https://www.huduser.gov/portal/dataset/fmr-api.html

The FMR endpoint takes county/metro entity IDs, not ZIPs, so lookup is
two-step: ZIP -> county FIPS via HUD's USPS crosswalk (type=2), then
FMR data for that county. In Small Area FMR metros the county response
carries per-ZIP rows and we pick the requested ZIP's row.
"""

import httpx

from app import config
from app.services.base import SourceNotConfigured

TIMEOUT_SECONDS = 12.0
_transport: httpx.AsyncBaseTransport | None = None


class HudError(Exception):
    pass


BEDROOM_KEYS = {
    "efficiency": "Efficiency",
    "oneBr": "One-Bedroom",
    "twoBr": "Two-Bedroom",
    "threeBr": "Three-Bedroom",
    "fourBr": "Four-Bedroom",
}


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.HUD_API_TOKEN}"}


async def _get_json(client: httpx.AsyncClient, path: str, params: dict | None = None):
    try:
        resp = await client.get(path, params=params, headers=_headers())
    except httpx.HTTPError as exc:
        raise HudError(f"HUD request failed: {exc}") from exc
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        raise HudError(f"HUD {path} returned {resp.status_code}: {resp.text[:200]}")
    return resp.json()


async def _county_fips(client: httpx.AsyncClient, zip_code: str) -> str | None:
    body = await _get_json(client, "/usps", params={"type": "2", "query": zip_code})
    results = ((body or {}).get("data") or {}).get("results") or []
    if not results:
        return None
    # A ZIP can straddle counties — take the one holding most residences.
    best = max(results, key=lambda r: r.get("res_ratio") or 0)
    geoid = str(best.get("geoid") or "")
    return geoid[:5] if len(geoid) >= 5 else None


def _pick_basicdata(basic, zip_code: str) -> dict | None:
    if isinstance(basic, dict):
        return basic
    if isinstance(basic, list) and basic:
        for row in basic:
            if str(row.get("zip_code") or "") == zip_code:
                return row
        return basic[0]
    return None


async def get_fair_market_rents(zip_code: str) -> dict | None:
    if not config.HUD_API_TOKEN:
        raise SourceNotConfigured("HUD_API_TOKEN is not set")

    async with httpx.AsyncClient(
        base_url=config.HUD_BASE_URL, timeout=TIMEOUT_SECONDS, transport=_transport
    ) as client:
        fips = await _county_fips(client, zip_code)
        if not fips:
            return None

        body = await _get_json(client, f"/fmr/data/{fips}99999")
        if body is None:
            return None

        data = body.get("data") or {}
        row = _pick_basicdata(data.get("basicdata"), zip_code)
        if not row:
            return None

        rents = {}
        for out_key, hud_key in BEDROOM_KEYS.items():
            value = row.get(hud_key)
            rents[out_key] = float(value) if value else None

        return {
            "year": row.get("year") or data.get("year"),
            "metroName": data.get("metro_name") or data.get("area_name") or data.get("county_name"),
            "smallArea": str(data.get("smallarea_status")) == "1",
            "rents": rents,
        }
