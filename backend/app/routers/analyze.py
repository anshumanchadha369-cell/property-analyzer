"""POST /analyze — fan out to data sources, merge into one analysis snapshot.

Every source gets its own status in meta.sources so a failing source degrades
its section to null instead of failing the whole analysis.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import config
from app.calculations import investment_metrics as calc
from app.services import rentcast, usage

router = APIRouter()

LIVE_RENTCAST_URL = "https://api.rentcast.io/v1"

MAX_COMPARABLES = 5


class AnalyzeRequest(BaseModel):
    address: str = Field(min_length=5, max_length=300)


def _map_property(p: dict) -> dict:
    features = p.get("features") or {}
    return {
        "formattedAddress": p.get("formattedAddress"),
        "propertyType": p.get("propertyType"),
        "bedrooms": p.get("bedrooms"),
        "bathrooms": p.get("bathrooms"),
        "squareFootage": p.get("squareFootage"),
        "lotSize": p.get("lotSize"),
        "yearBuilt": p.get("yearBuilt"),
        "unitCount": features.get("unitCount") or p.get("unitCount"),
        "lastSalePrice": p.get("lastSalePrice"),
        "lastSaleDate": p.get("lastSaleDate"),
        "county": p.get("county"),
        "latitude": p.get("latitude"),
        "longitude": p.get("longitude"),
    }


def _latest_annual_tax(p: dict | None) -> float | None:
    taxes = (p or {}).get("propertyTaxes") or {}
    if not taxes:
        return None
    latest_year = max(taxes.keys())
    total = (taxes[latest_year] or {}).get("total")
    return float(total) if total else None


def _trim_comparables(source: dict | None) -> list[dict]:
    comps = (source or {}).get("comparables") or []
    trimmed = []
    for c in comps[:MAX_COMPARABLES]:
        trimmed.append(
            {
                "formattedAddress": c.get("formattedAddress"),
                "price": c.get("price"),
                "correlation": c.get("correlation"),
                "distance": c.get("distance"),
                "squareFootage": c.get("squareFootage"),
                "bedrooms": c.get("bedrooms"),
            }
        )
    return trimmed


@router.post("/analyze")
async def analyze(req: AnalyzeRequest) -> dict:
    address = req.address.strip()

    prop_result, value_result, rent_result = await asyncio.gather(
        rentcast.get_property_records(address),
        rentcast.get_value_estimate(address),
        rentcast.get_rent_estimate(address),
        return_exceptions=True,
    )

    sources: dict[str, dict] = {}

    def unwrap(name: str, result):
        if isinstance(result, BaseException):
            detail = str(result)
            sources[name] = {"status": "error", "freshness": None, "detail": detail}
            return None
        if result is None:
            sources[name] = {"status": "no_data", "freshness": "live", "detail": None}
            return None
        sources[name] = {"status": "ok", "freshness": "live", "detail": None}
        return result

    prop = unwrap("rentcast_property", prop_result)
    value = unwrap("rentcast_value", value_result)
    rent = unwrap("rentcast_rent", rent_result)

    # RentCast bills successful requests; errors don't count against quota.
    # no_data responses (404) are counted conservatively. Mock mode (base URL
    # overridden for testing) spends no real quota, so nothing is recorded.
    is_live = config.RENTCAST_BASE_URL == LIVE_RENTCAST_URL
    billable_calls = (
        sum(1 for s in sources.values() if s["status"] in ("ok", "no_data"))
        if is_live
        else 0
    )
    if billable_calls:
        usage.record(billable_calls)

    property_section = _map_property(prop) if prop else None

    valuation_section = None
    if value:
        valuation_section = {
            "value": value.get("price"),
            "valueRangeLow": value.get("priceRangeLow"),
            "valueRangeHigh": value.get("priceRangeHigh"),
            "comparables": _trim_comparables(value),
        }

    rental_section = None
    if rent:
        rental_section = {
            "rent": rent.get("rent"),
            "rentRangeLow": rent.get("rentRangeLow"),
            "rentRangeHigh": rent.get("rentRangeHigh"),
            "comparables": _trim_comparables(rent),
        }

    metrics = None
    metrics_unavailable_reason = None
    price = (valuation_section or {}).get("value")
    monthly_rent = (rental_section or {}).get("rent")
    if price and monthly_rent:
        try:
            metrics = calc.compute_metrics(
                price=price,
                monthly_rent=monthly_rent,
                annual_taxes=_latest_annual_tax(prop),
                square_footage=(property_section or {}).get("squareFootage"),
                unit_count=(property_section or {}).get("unitCount"),
            )
        except ValueError as exc:
            metrics_unavailable_reason = str(exc)
    else:
        missing = []
        if not price:
            missing.append("value estimate")
        if not monthly_rent:
            missing.append("rent estimate")
        metrics_unavailable_reason = f"missing {' and '.join(missing)}"

    return {
        "property": property_section,
        "valuation": valuation_section,
        "rental": rental_section,
        "metrics": metrics,
        "meta": {
            "address": address,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "sources": sources,
            "metricsAvailable": metrics is not None,
            "metricsUnavailableReason": metrics_unavailable_reason,
            "usage": {
                **usage.snapshot(),
                "callsThisRequest": billable_calls,
                "mockMode": not is_live,
            },
        },
    }


@router.get("/usage")
def get_usage() -> dict:
    return {
        **usage.snapshot(),
        "mockMode": config.RENTCAST_BASE_URL != LIVE_RENTCAST_URL,
    }
