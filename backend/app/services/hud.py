"""HUD Fair Market Rents (FMR) client — free official API, annual data.

FMRs are 40th-percentile gross rents; a useful sanity check against the
RentCast rent AVM. Token signup: https://www.huduser.gov/portal/dataset/fmr-api.html
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


async def get_fair_market_rents(zip_code: str) -> dict | None:
    if not config.HUD_API_TOKEN:
        raise SourceNotConfigured("HUD_API_TOKEN is not set")

    async with httpx.AsyncClient(
        base_url=config.HUD_BASE_URL, timeout=TIMEOUT_SECONDS, transport=_transport
    ) as client:
        try:
            resp = await client.get(
                f"/fmr/data/{zip_code}",
                headers={"Authorization": f"Bearer {config.HUD_API_TOKEN}"},
            )
        except httpx.HTTPError as exc:
            raise HudError(f"HUD request failed: {exc}") from exc

    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        raise HudError(f"HUD returned {resp.status_code}: {resp.text[:200]}")

    body = resp.json()
    basic = (body.get("data") or {}).get("basicdata")
    if isinstance(basic, list):
        basic = basic[0] if basic else None
    if not isinstance(basic, dict):
        return None

    rents = {}
    for out_key, hud_key in BEDROOM_KEYS.items():
        value = basic.get(hud_key)
        rents[out_key] = float(value) if value else None

    return {
        "year": basic.get("year"),
        "metroName": (body.get("data") or {}).get("metro_name")
        or (body.get("data") or {}).get("area_name"),
        "smallArea": bool((body.get("data") or {}).get("smallarea_status")),
        "rents": rents,
    }
