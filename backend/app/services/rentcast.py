"""Async client for the RentCast API (property records, value & rent AVMs)."""

import httpx

from app import config

TIMEOUT_SECONDS = 15.0

# Test seam: set to an httpx.MockTransport in tests to avoid real HTTP.
_transport: httpx.AsyncBaseTransport | None = None


class RentCastError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _api_key() -> str:
    key = config.RENTCAST_API_KEY
    if not key or key == "PASTE_YOUR_KEY_HERE":
        raise RentCastError("RENTCAST_API_KEY is not configured")
    return key


async def _get(path: str, params: dict) -> dict | list | None:
    headers = {"X-Api-Key": _api_key(), "Accept": "application/json"}
    async with httpx.AsyncClient(
        base_url=config.RENTCAST_BASE_URL,
        timeout=TIMEOUT_SECONDS,
        transport=_transport,
    ) as client:
        try:
            resp = await client.get(path, params=params, headers=headers)
        except httpx.HTTPError as exc:
            raise RentCastError(f"RentCast request failed: {exc}") from exc

    # RentCast responds 404 when it has no data for the given address.
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        raise RentCastError(
            f"RentCast {path} returned {resp.status_code}: {resp.text[:200]}",
            status_code=resp.status_code,
        )
    return resp.json()


async def get_property_records(address: str) -> dict | None:
    data = await _get("/properties", {"address": address})
    if isinstance(data, list):
        return data[0] if data else None
    return data


async def get_value_estimate(address: str) -> dict | None:
    return await _get("/avm/value", {"address": address})


async def get_rent_estimate(address: str) -> dict | None:
    return await _get("/avm/rent/long-term", {"address": address})
