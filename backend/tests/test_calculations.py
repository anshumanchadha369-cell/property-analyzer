import pytest

from app.calculations import investment_metrics as calc


def test_gross_scheduled_income():
    assert calc.gross_scheduled_income(2000) == 24000


def test_effective_gross_income_default_vacancy():
    assert calc.effective_gross_income(24000) == pytest.approx(22800)


def test_effective_gross_income_custom_vacancy():
    assert calc.effective_gross_income(24000, vacancy_rate=0.10) == pytest.approx(21600)


def test_expenses_with_sourced_taxes():
    expenses = calc.estimate_operating_expenses(
        egi_annual=45600, property_value=400_000, annual_taxes=4800
    )
    assert expenses["propertyTaxes"] == 4800
    assert expenses["taxesEstimated"] is False
    assert expenses["insurance"] == pytest.approx(2000)  # 0.5% of value
    assert expenses["insuranceEstimated"] is True
    assert expenses["management"] == pytest.approx(4560)  # 10% of EGI
    assert expenses["maintenance"] == pytest.approx(4560)
    assert expenses["total"] == pytest.approx(4800 + 2000 + 4560 + 4560)


def test_expenses_estimates_taxes_when_missing():
    expenses = calc.estimate_operating_expenses(
        egi_annual=45600, property_value=400_000, annual_taxes=None
    )
    assert expenses["propertyTaxes"] == pytest.approx(4000)  # 1% of value
    assert expenses["taxesEstimated"] is True


def test_net_operating_income():
    assert calc.net_operating_income(45600, 15920) == pytest.approx(29680)


def test_cap_rate():
    assert calc.cap_rate(24000, 400_000) == pytest.approx(0.06)


def test_cap_rate_zero_price_is_none():
    assert calc.cap_rate(24000, 0) is None


def test_gross_rent_multiplier():
    assert calc.gross_rent_multiplier(400_000, 48_000) == pytest.approx(8.3333, rel=1e-4)


def test_gross_rent_multiplier_zero_income_is_none():
    assert calc.gross_rent_multiplier(400_000, 0) is None


def test_one_percent_rule_passes_at_exactly_one_percent():
    result = calc.one_percent_rule(4000, 400_000)
    assert result["ratio"] == pytest.approx(0.01)
    assert result["passes"] is True


def test_one_percent_rule_fails_below_threshold():
    result = calc.one_percent_rule(2000, 400_000)
    assert result["ratio"] == pytest.approx(0.005)
    assert result["passes"] is False


def test_one_percent_rule_zero_price():
    assert calc.one_percent_rule(2000, 0) == {"ratio": None, "passes": False}


def test_price_per_sqft():
    assert calc.price_per_sqft(400_000, 3600) == pytest.approx(111.11, rel=1e-3)
    assert calc.price_per_sqft(400_000, None) is None
    assert calc.price_per_sqft(400_000, 0) is None


def test_price_per_unit():
    assert calc.price_per_unit(400_000, 4) == pytest.approx(100_000)
    assert calc.price_per_unit(400_000, None) is None


def test_compute_metrics_full_case():
    m = calc.compute_metrics(
        price=400_000,
        monthly_rent=4000,
        annual_taxes=4800,
        square_footage=3600,
        unit_count=4,
    )
    assert m["grossScheduledIncome"] == 48_000
    assert m["effectiveGrossIncome"] == pytest.approx(45_600)
    assert m["operatingExpenses"]["total"] == pytest.approx(15_920)
    assert m["noi"] == pytest.approx(29_680)
    assert m["capRate"] == pytest.approx(0.0742)
    assert m["grm"] == pytest.approx(8.3333, rel=1e-4)
    assert m["onePercentRule"]["passes"] is True
    assert m["pricePerSqft"] == pytest.approx(111.11)
    assert m["pricePerUnit"] == pytest.approx(100_000)


def test_compute_metrics_rejects_nonpositive_inputs():
    with pytest.raises(ValueError):
        calc.compute_metrics(price=0, monthly_rent=4000)
    with pytest.raises(ValueError):
        calc.compute_metrics(price=400_000, monthly_rent=-5)
