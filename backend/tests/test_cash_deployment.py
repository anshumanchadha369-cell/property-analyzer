import pytest

from app.calculations import cash_deployment as cd


def test_monthly_payment_standard_loan():
    # 585,000 @ 7% / 30yr — canonical fixture shared with the TS mirror
    payment = cd.monthly_mortgage_payment(585_000, 0.07, 30)
    assert payment == pytest.approx(3892, rel=1e-3)


def test_monthly_payment_zero_rate():
    assert cd.monthly_mortgage_payment(360_000, 0.0, 30) == pytest.approx(1000)


def test_monthly_payment_zero_loan():
    assert cd.monthly_mortgage_payment(0, 0.07, 30) == 0.0


def test_dscr():
    assert cd.dscr(46_800, 39_000) == pytest.approx(1.2)
    assert cd.dscr(40_000, 0) is None


def test_cash_on_cash():
    assert cd.cash_on_cash(15_000, 250_000) == pytest.approx(0.06)
    assert cd.cash_on_cash(15_000, 0) is None


def test_break_even_months():
    assert cd.break_even_months(120_000, 1_000) == pytest.approx(120)
    assert cd.break_even_months(120_000, 0) is None
    assert cd.break_even_months(120_000, -500) is None


def test_compute_deployment_full_fixture():
    """Mock Tacoma fourplex: price 780k, NOI 40,372, opex 1,939.83/mo.

    25% down @ 7%/30yr:
      down 195,000; loan 585,000; P&I ~3,892.1; ADS ~46,705
      closing 3% = 23,400; rehab 0; invested = 218,400
      reserve = 3 × (1,939.83 + 3,892.1) ≈ 17,495.8; total ≈ 235,895.8
      annual CF = 40,372 − 46,705 ≈ −6,333 (negative → no break-even)
      DSCR ≈ 0.86
    """
    result = cd.compute_deployment(
        price=780_000,
        noi_annual=40_372,
        monthly_opex=1_939.83,
        available_cash=250_000,
    )
    assert result["downPayment"] == pytest.approx(195_000)
    assert result["loanAmount"] == pytest.approx(585_000)
    assert result["monthlyPI"] == pytest.approx(3892, rel=1e-3)
    assert result["closingCosts"] == pytest.approx(23_400)
    assert result["cashInvested"] == pytest.approx(218_400)
    assert result["reserve"] == pytest.approx(17_496, rel=1e-3)
    assert result["totalRequired"] == pytest.approx(235_896, rel=1e-3)
    assert result["undeployed"] == pytest.approx(250_000 - 235_896, rel=1e-2)
    assert result["dscr"] == pytest.approx(0.86, abs=0.01)
    assert result["annualCashFlow"] < 0
    assert result["breakEvenMonths"] is None
    assert result["cashOnCash"] < 0


def test_compute_deployment_healthy_deal():
    """A deal that clears every threshold: price 400k, NOI 38k."""
    result = cd.compute_deployment(
        price=400_000,
        noi_annual=38_000,
        monthly_opex=1_200,
        available_cash=160_000,
    )
    # loan 300k @7%/30 → P&I ~1,995.9; ADS ~23,951
    assert result["monthlyPI"] == pytest.approx(1996, rel=1e-3)
    assert result["dscr"] == pytest.approx(1.59, abs=0.01)
    annual_cf = result["annualCashFlow"]
    assert annual_cf == pytest.approx(38_000 - 23_951, rel=1e-3)
    # invested = 100k down + 12k closing = 112k → CoC ~12.5%
    assert result["cashOnCash"] == pytest.approx(0.1254, abs=0.002)
    assert result["breakEvenMonths"] == pytest.approx(
        112_000 / (annual_cf / 12), rel=1e-3
    )
    assert result["cocPremium"] == pytest.approx(result["cashOnCash"] - 0.04, abs=1e-6)


def test_compute_deployment_without_available_cash():
    result = cd.compute_deployment(price=400_000, noi_annual=30_000, monthly_opex=1_000)
    assert result["undeployed"] is None
    assert result["totalRequired"] > 0


def test_compute_deployment_rejects_bad_price():
    with pytest.raises(ValueError):
        cd.compute_deployment(price=0, noi_annual=10_000, monthly_opex=500)


# ---- targets (round-trip: plug the target back in, milestone must hold) ----

LAKEWOOD = dict(
    price=674_999,
    monthly_rent=4_950,
    annual_taxes=5_737.0,
    down_pct=0.25,
    interest_rate=0.07,
    loan_years=30,
    closing_pct=0.03,
    rehab_budget=0.0,
    vacancy_rate=0.05,
    management_rate=0.10,
    maintenance_rate=0.10,
)


def _deployment_at(price: float, monthly_rent: float, taxes: float | None):
    from app.calculations import investment_metrics as calc

    metrics = calc.compute_metrics(
        price=price,
        monthly_rent=monthly_rent,
        annual_taxes=taxes,
        vacancy_rate=LAKEWOOD["vacancy_rate"],
        management_rate=LAKEWOOD["management_rate"],
        maintenance_rate=LAKEWOOD["maintenance_rate"],
    )
    return cd.compute_deployment(
        price=price,
        noi_annual=metrics["noi"],
        monthly_opex=metrics["operatingExpenses"]["total"] / 12,
        down_pct=LAKEWOOD["down_pct"],
        interest_rate=LAKEWOOD["interest_rate"],
        loan_years=LAKEWOOD["loan_years"],
        closing_pct=LAKEWOOD["closing_pct"],
        rehab_budget=LAKEWOOD["rehab_budget"],
    )


def test_targets_lakewood_deal_is_underwater_at_asking():
    targets = cd.compute_targets(**LAKEWOOD)
    # All three max prices must be below asking for this deal
    assert targets["breakEven"]["maxPrice"] < LAKEWOOD["price"]
    assert targets["dscr125"]["maxPrice"] < targets["breakEven"]["maxPrice"]
    assert targets["coc6"]["maxPrice"] < targets["breakEven"]["maxPrice"]
    # And required rents must exceed current rent
    for key in ("breakEven", "dscr125", "coc6"):
        assert targets[key]["requiredRent"] > LAKEWOOD["monthly_rent"]


def test_target_price_round_trip_break_even():
    targets = cd.compute_targets(**LAKEWOOD)
    result = _deployment_at(
        targets["breakEven"]["maxPrice"], LAKEWOOD["monthly_rent"], LAKEWOOD["annual_taxes"]
    )
    assert result["annualCashFlow"] >= 0
    assert result["annualCashFlow"] < 600  # tight: floored price sits just under the bound


def test_target_price_round_trip_dscr():
    targets = cd.compute_targets(**LAKEWOOD)
    result = _deployment_at(
        targets["dscr125"]["maxPrice"], LAKEWOOD["monthly_rent"], LAKEWOOD["annual_taxes"]
    )
    assert result["dscr"] >= 1.25
    assert result["dscr"] < 1.26


def test_target_price_round_trip_coc6():
    targets = cd.compute_targets(**LAKEWOOD)
    result = _deployment_at(
        targets["coc6"]["maxPrice"], LAKEWOOD["monthly_rent"], LAKEWOOD["annual_taxes"]
    )
    assert result["cashOnCash"] >= 0.06
    assert result["cashOnCash"] < 0.062


def test_target_rent_round_trip_coc6():
    targets = cd.compute_targets(**LAKEWOOD)
    result = _deployment_at(
        LAKEWOOD["price"], targets["coc6"]["requiredRent"], LAKEWOOD["annual_taxes"]
    )
    assert result["cashOnCash"] >= 0.06
    assert result["cashOnCash"] < 0.062


def test_targets_with_estimated_taxes_round_trip():
    params = {**LAKEWOOD, "annual_taxes": None}
    targets = cd.compute_targets(**params)
    result = _deployment_at(targets["coc6"]["maxPrice"], LAKEWOOD["monthly_rent"], None)
    assert result["cashOnCash"] >= 0.06
    assert result["cashOnCash"] < 0.062


def test_targets_degenerate_rates_return_none():
    params = {**LAKEWOOD, "management_rate": 0.6, "maintenance_rate": 0.5}
    targets = cd.compute_targets(**params)
    assert targets["coc6"] == {"maxPrice": None, "requiredRent": None}
