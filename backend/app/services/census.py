"""Census Bureau ACS 5-year client — free official API, annual releases.

Pulls ZIP-level (ZCTA) population, median household income, and median gross
rent. Key signup: https://api.census.gov/data/key_signup.html
"""

import httpx

from app import config
from app.services.base import SourceNotConfigured

TIMEOUT_SECONDS = 12.0
_transport: httpx.AsyncBaseTransport | None = None

ACS_YEAR = 2023
VARIABLES = "NAME,B01003_001E,B19013_001E,B25064_001E"


class CensusError(Exception):
    pass


def _clean(value: str | None) -> int | None:
    """ACS uses large negative sentinels for suppressed/missing values."""
    if value is None:
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n >= 0 else None


async def get_demographics(zip_code: str) -> dict | None:
    if not config.CENSUS_API_KEY:
        raise SourceNotConfigured("CENSUS_API_KEY is not set")

    params = {
        "get": VARIABLES,
        "for": f"zip code tabulation area:{zip_code}",
        "key": config.CENSUS_API_KEY,
    }
    async with httpx.AsyncClient(
        base_url=config.CENSUS_BASE_URL, timeout=TIMEOUT_SECONDS, transport=_transport
    ) as client:
        try:
            resp = await client.get(f"/data/{ACS_YEAR}/acs/acs5", params=params)
        except httpx.HTTPError as exc:
            raise CensusError(f"Census request failed: {exc}") from exc

    # Census returns 204 (empty) for unknown ZCTAs.
    if resp.status_code == 204 or not resp.text.strip():
        return None
    if resp.status_code != 200:
        raise CensusError(f"Census returned {resp.status_code}: {resp.text[:200]}")

    rows = resp.json()
    if not isinstance(rows, list) or len(rows) < 2:
        return None
    headers, values = rows[0], rows[1]
    record = dict(zip(headers, values))

    return {
        "population": _clean(record.get("B01003_001E")),
        "medianHouseholdIncome": _clean(record.get("B19013_001E")),
        "medianGrossRent": _clean(record.get("B25064_001E")),
        "acsYear": ACS_YEAR,
    }
