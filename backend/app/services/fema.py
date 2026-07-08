"""FEMA National Flood Hazard Layer client — free, no key, point-in-polygon
flood-zone lookup via the public ArcGIS REST service (layer 28: flood zones).
"""

import httpx

from app import config

TIMEOUT_SECONDS = 12.0
_transport: httpx.AsyncBaseTransport | None = None

# Zones starting with A or V are Special Flood Hazard Areas (1%-annual-chance).
HIGH_RISK_PREFIXES = ("A", "V")


class FemaError(Exception):
    pass


async def get_flood_zone(latitude: float, longitude: float) -> dict | None:
    params = {
        "geometry": f"{longitude},{latitude}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "FLD_ZONE,ZONE_SUBTY",
        "returnGeometry": "false",
        "f": "json",
    }
    async with httpx.AsyncClient(
        base_url=config.FEMA_NFHL_BASE_URL, timeout=TIMEOUT_SECONDS, transport=_transport
    ) as client:
        try:
            resp = await client.get("/28/query", params=params)
        except httpx.HTTPError as exc:
            raise FemaError(f"FEMA request failed: {exc}") from exc

    if resp.status_code != 200:
        raise FemaError(f"FEMA returned {resp.status_code}: {resp.text[:200]}")

    body = resp.json()
    if "error" in body:
        raise FemaError(f"FEMA service error: {body['error']}")

    features = body.get("features") or []
    if not features:
        return None  # outside mapped flood hazard data

    attributes = features[0].get("attributes") or {}
    zone = attributes.get("FLD_ZONE")
    if not zone:
        return None
    return {
        "floodZone": zone,
        "zoneSubtype": attributes.get("ZONE_SUBTY"),
        "isHighRisk": zone.startswith(HIGH_RISK_PREFIXES),
    }
