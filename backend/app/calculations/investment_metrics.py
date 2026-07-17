"""Pure investment-metric calculations. No I/O — fully unit-testable.

All *_annual values are dollars per year; monthly_rent is dollars per month.
Rates are fractions (0.05 == 5%).
"""

DEFAULT_VACANCY_RATE = 0.05
DEFAULT_MANAGEMENT_RATE = 0.10
DEFAULT_MAINTENANCE_RATE = 0.10
# Insurance fallback: flat per-door annual estimate (user-calibrated for
# WA multi-family). Taxes fallback stays a fraction of property value.
INSURANCE_PER_DOOR = 600.0
DEFAULT_TAX_RATE_OF_VALUE = 0.01

ONE_PERCENT_THRESHOLD = 0.01


def gross_scheduled_income(monthly_rent: float) -> float:
    return monthly_rent * 12


def effective_gross_income(
    gsi_annual: float, vacancy_rate: float = DEFAULT_VACANCY_RATE
) -> float:
    return gsi_annual * (1 - vacancy_rate)


def estimate_operating_expenses(
    *,
    egi_annual: float,
    property_value: float,
    annual_taxes: float | None = None,
    management_rate: float = DEFAULT_MANAGEMENT_RATE,
    maintenance_rate: float = DEFAULT_MAINTENANCE_RATE,
    insurance_annual: float | None = None,
    unit_count: int | None = None,
    hoa_annual: float = 0.0,
) -> dict:
    taxes_estimated = annual_taxes is None
    if annual_taxes is None:
        annual_taxes = property_value * DEFAULT_TAX_RATE_OF_VALUE
    insurance_estimated = insurance_annual is None
    if insurance_annual is None:
        insurance_annual = INSURANCE_PER_DOOR * (unit_count or 1)

    management = egi_annual * management_rate
    maintenance = egi_annual * maintenance_rate
    total = annual_taxes + insurance_annual + management + maintenance + hoa_annual

    return {
        "propertyTaxes": round(annual_taxes, 2),
        "taxesEstimated": taxes_estimated,
        "insurance": round(insurance_annual, 2),
        "insuranceEstimated": insurance_estimated,
        "management": round(management, 2),
        "maintenance": round(maintenance, 2),
        "hoa": round(hoa_annual, 2),
        "total": round(total, 2),
    }


def net_operating_income(egi_annual: float, total_expenses_annual: float) -> float:
    return egi_annual - total_expenses_annual


def cap_rate(noi_annual: float, price: float) -> float | None:
    if price <= 0:
        return None
    return noi_annual / price


def gross_rent_multiplier(price: float, gsi_annual: float) -> float | None:
    if gsi_annual <= 0:
        return None
    return price / gsi_annual


def one_percent_rule(monthly_rent: float, price: float) -> dict:
    if price <= 0:
        return {"ratio": None, "passes": False}
    ratio = monthly_rent / price
    return {"ratio": round(ratio, 4), "passes": ratio >= ONE_PERCENT_THRESHOLD}


def price_per_sqft(price: float, square_footage: float | None) -> float | None:
    if not square_footage or square_footage <= 0:
        return None
    return price / square_footage


def price_per_unit(price: float, unit_count: int | None) -> float | None:
    if not unit_count or unit_count <= 0:
        return None
    return price / unit_count


def compute_metrics(
    *,
    price: float,
    monthly_rent: float,
    annual_taxes: float | None = None,
    square_footage: float | None = None,
    unit_count: int | None = None,
    vacancy_rate: float = DEFAULT_VACANCY_RATE,
    management_rate: float = DEFAULT_MANAGEMENT_RATE,
    maintenance_rate: float = DEFAULT_MAINTENANCE_RATE,
    insurance_annual: float | None = None,
    hoa_annual: float = 0.0,
) -> dict:
    if price <= 0:
        raise ValueError("price must be positive")
    if monthly_rent <= 0:
        raise ValueError("monthly_rent must be positive")

    gsi = gross_scheduled_income(monthly_rent)
    egi = effective_gross_income(gsi, vacancy_rate)
    expenses = estimate_operating_expenses(
        egi_annual=egi,
        property_value=price,
        annual_taxes=annual_taxes,
        management_rate=management_rate,
        maintenance_rate=maintenance_rate,
        insurance_annual=insurance_annual,
        unit_count=unit_count,
        hoa_annual=hoa_annual,
    )
    noi = net_operating_income(egi, expenses["total"])

    cap = cap_rate(noi, price)
    grm = gross_rent_multiplier(price, gsi)
    ppsf = price_per_sqft(price, square_footage)
    ppu = price_per_unit(price, unit_count)

    return {
        "price": round(price, 2),
        "monthlyRent": round(monthly_rent, 2),
        "grossScheduledIncome": round(gsi, 2),
        "vacancyRate": vacancy_rate,
        "effectiveGrossIncome": round(egi, 2),
        "operatingExpenses": expenses,
        "noi": round(noi, 2),
        "capRate": round(cap, 4) if cap is not None else None,
        "grm": round(grm, 4) if grm is not None else None,
        "onePercentRule": one_percent_rule(monthly_rent, price),
        "pricePerSqft": round(ppsf, 2) if ppsf is not None else None,
        "pricePerUnit": round(ppu, 2) if ppu is not None else None,
    }
