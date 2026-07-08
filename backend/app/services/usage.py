"""RentCast API usage tracking.

RentCast exposes no usage headers or endpoint, so we tally billable calls
ourselves. This in-process tally resets when the server restarts (Render free
tier restarts often) — the frontend keeps its own persistent tally in
localStorage and reconciles with this one by taking the max.

Billing facts (user's RentCast Developer plan, confirmed 2026-07-08):
- 50 requests included per billing period, $0 base fee
- $0.20 per request beyond 50 (card on file, so overage bills instead of failing)
- Billing period renews on the 8th of each month
"""

from datetime import date, datetime, timezone

MONTHLY_QUOTA = 50
OVERAGE_PER_CALL = 0.20
BILLING_CYCLE_DAY = 8

_tally: dict = {"period_start": None, "calls": 0}


def current_period_start(today: date | None = None) -> str:
    d = today or datetime.now(timezone.utc).date()
    if d.day >= BILLING_CYCLE_DAY:
        start = date(d.year, d.month, BILLING_CYCLE_DAY)
    elif d.month == 1:
        start = date(d.year - 1, 12, BILLING_CYCLE_DAY)
    else:
        start = date(d.year, d.month - 1, BILLING_CYCLE_DAY)
    return start.isoformat()


def _roll_period() -> None:
    period = current_period_start()
    if _tally["period_start"] != period:
        _tally["period_start"] = period
        _tally["calls"] = 0


def record(calls: int) -> None:
    _roll_period()
    _tally["calls"] += calls


def snapshot() -> dict:
    _roll_period()
    return {
        "periodStart": _tally["period_start"],
        "callsThisPeriod": _tally["calls"],
        "quota": MONTHLY_QUOTA,
        "overagePerCall": OVERAGE_PER_CALL,
        "tallySource": "server-memory",
    }


def reset_for_tests() -> None:
    _tally["period_start"] = None
    _tally["calls"] = 0
