from datetime import date

import pytest

from app.services import usage


@pytest.fixture(autouse=True)
def fresh_tally():
    usage.reset_for_tests()
    yield
    usage.reset_for_tests()


def test_period_start_on_or_after_cycle_day():
    assert usage.current_period_start(date(2026, 7, 8)) == "2026-07-08"
    assert usage.current_period_start(date(2026, 7, 31)) == "2026-07-08"


def test_period_start_before_cycle_day_uses_previous_month():
    assert usage.current_period_start(date(2026, 7, 7)) == "2026-06-08"


def test_period_start_january_wraps_to_december():
    assert usage.current_period_start(date(2026, 1, 3)) == "2025-12-08"


def test_record_accumulates():
    usage.record(3)
    usage.record(2)
    snap = usage.snapshot()
    assert snap["callsThisPeriod"] == 5
    assert snap["quota"] == 50
    assert snap["overagePerCall"] == 0.20


def test_snapshot_includes_period_start():
    usage.record(1)
    snap = usage.snapshot()
    assert snap["periodStart"] == usage.current_period_start()
    assert snap["tallySource"] == "server-memory"
