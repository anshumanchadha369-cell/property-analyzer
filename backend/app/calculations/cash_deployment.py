"""Cash deployment & financing math. Pure functions, mirrored in the frontend
(frontend/src/lib/deal-math.ts) — keep formulas and defaults in sync.

The frontend computes these live for instant slider feedback; this module is
the tested reference implementation.
"""

DEFAULT_DOWN_PCT = 0.25
DEFAULT_CLOSING_PCT = 0.03
DEFAULT_RESERVE_MONTHS = 3
DEFAULT_HYSA_RATE = 0.04

# Typical loan presets (rate/term defaults; user-adjustable in the UI)
LOAN_PRESETS = {
    "conventional": {"rate": 0.07, "years": 30, "down_pct": 0.25},
    "dscr": {"rate": 0.075, "years": 30, "down_pct": 0.25},
    "commercial": {"rate": 0.0725, "years": 25, "down_pct": 0.30},
}


def monthly_mortgage_payment(loan_amount: float, annual_rate: float, years: int) -> float:
    n = years * 12
    if n <= 0 or loan_amount <= 0:
        return 0.0
    if annual_rate <= 0:
        return loan_amount / n
    r = annual_rate / 12
    factor = (1 + r) ** n
    return loan_amount * r * factor / (factor - 1)


def annual_debt_service(loan_amount: float, annual_rate: float, years: int) -> float:
    return monthly_mortgage_payment(loan_amount, annual_rate, years) * 12


def dscr(noi_annual: float, annual_debt: float) -> float | None:
    if annual_debt <= 0:
        return None
    return noi_annual / annual_debt


def annual_cash_flow(noi_annual: float, annual_debt: float) -> float:
    return noi_annual - annual_debt


def cash_on_cash(annual_cf: float, cash_invested: float) -> float | None:
    if cash_invested <= 0:
        return None
    return annual_cf / cash_invested


def break_even_months(cash_invested: float, monthly_cf: float) -> float | None:
    """Months for cumulative cash flow to recover the cash spent (down +
    closing + rehab). None when cash flow is non-positive — never recovers."""
    if monthly_cf <= 0 or cash_invested <= 0:
        return None
    return cash_invested / monthly_cf


TARGET_DSCR = 1.25
TARGET_COC = 0.06
TAX_RATE_OF_VALUE = 0.01


def compute_targets(
    *,
    price: float,
    monthly_rent: float,
    annual_taxes: float | None,  # None -> estimated at 1% of price
    insurance_annual: float,  # fixed (per-door estimate or actual)
    down_pct: float,
    interest_rate: float,
    loan_years: int,
    closing_pct: float,
    rehab_budget: float,
    vacancy_rate: float,
    management_rate: float,
    maintenance_rate: float,
) -> dict:
    """Closed-form 'what would make this deal work' targets.

    For each milestone (cash flow >= 0, DSCR >= 1.25, CoC >= 6%) returns the
    max purchase price at current rent and the required rent at current price.
    Mirrored in frontend/src/lib/deal-math.ts computeTargets — keep in sync.

    Derivation: with D = 12(1-v)(1-m-mt), rent-driven NOI A = D*R,
    price-proportional expenses cP (taxes 1% when estimated), fixed costs
    F = insurance + taxes-when-sourced, and per-dollar annual debt service
    ads1 = 12*payment(1-d, rate, years):
      cash flow >= 0:   A - cP - F - ads1*P >= 0
      DSCR >= t:        A - cP - F - t*ads1*P >= 0
      CoC >= y:         A - cP - F - ads1*P >= y*((d+cl)P + rehab)
    each linear in P (solve for max P) and in R (solve for required rent).
    """
    rent_factor = 12 * (1 - vacancy_rate) * (1 - management_rate - maintenance_rate)
    if rent_factor <= 0 or price <= 0 or monthly_rent <= 0:
        empty = {"maxPrice": None, "requiredRent": None}
        return {"breakEven": dict(empty), "dscr125": dict(empty), "coc6": dict(empty)}

    taxes_estimated = annual_taxes is None
    c = TAX_RATE_OF_VALUE if taxes_estimated else 0.0
    t0 = float(insurance_annual) + (0.0 if taxes_estimated else float(annual_taxes))
    a = rent_factor * monthly_rent
    ads1 = annual_debt_service(1 - down_pct, interest_rate, loan_years)

    def solve(debt_multiplier: float, coc_target: float) -> dict:
        # price bound: A - T0 - coc*rehab >= P*(c + mult*ads1 + coc*(d+cl))
        denom = c + debt_multiplier * ads1 + coc_target * (down_pct + closing_pct)
        numer = a - t0 - coc_target * rehab_budget
        max_price = numer / denom if denom > 0 and numer > 0 else None
        # rent bound at current price
        need = (
            c * price
            + t0
            + debt_multiplier * ads1 * price
            + coc_target * ((down_pct + closing_pct) * price + rehab_budget)
        )
        required_rent = need / rent_factor if need > 0 else None
        return {
            # conservative rounding: floor the price, ceil the rent
            "maxPrice": None if max_price is None else float(int(max_price // 500) * 500),
            "requiredRent": None
            if required_rent is None
            else float(-int(-required_rent // 5) * 5),
        }

    return {
        "breakEven": solve(1.0, 0.0),
        "dscr125": solve(TARGET_DSCR, 0.0),
        "coc6": solve(1.0, TARGET_COC),
    }


def compute_deployment(
    *,
    price: float,
    noi_annual: float,
    monthly_opex: float,
    down_pct: float = DEFAULT_DOWN_PCT,
    interest_rate: float = LOAN_PRESETS["conventional"]["rate"],
    loan_years: int = LOAN_PRESETS["conventional"]["years"],
    closing_pct: float = DEFAULT_CLOSING_PCT,
    rehab_budget: float = 0.0,
    reserve_months: int = DEFAULT_RESERVE_MONTHS,
    available_cash: float | None = None,
    hysa_rate: float = DEFAULT_HYSA_RATE,
) -> dict:
    if price <= 0:
        raise ValueError("price must be positive")

    down_payment = price * down_pct
    loan_amount = price - down_payment
    monthly_pi = monthly_mortgage_payment(loan_amount, interest_rate, loan_years)
    annual_debt = monthly_pi * 12

    closing_costs = price * closing_pct
    # Reserve covers operating expenses AND debt service for N months.
    reserve = reserve_months * (monthly_opex + monthly_pi)

    # Cash actually spent acquiring the deal. The reserve stays yours (parked),
    # so it's excluded from the return denominator but included in the total
    # cash you must bring.
    cash_invested = down_payment + closing_costs + rehab_budget
    total_required = cash_invested + reserve

    annual_cf = annual_cash_flow(noi_annual, annual_debt)
    monthly_cf = annual_cf / 12
    coc = cash_on_cash(annual_cf, cash_invested)

    undeployed = None if available_cash is None else available_cash - total_required

    hysa_annual_yield = cash_invested * hysa_rate
    coc_premium = None if coc is None else coc - hysa_rate

    return {
        "downPayment": round(down_payment, 2),
        "loanAmount": round(loan_amount, 2),
        "monthlyPI": round(monthly_pi, 2),
        "annualDebtService": round(annual_debt, 2),
        "closingCosts": round(closing_costs, 2),
        "rehabBudget": round(rehab_budget, 2),
        "reserve": round(reserve, 2),
        "cashInvested": round(cash_invested, 2),
        "totalRequired": round(total_required, 2),
        "undeployed": None if undeployed is None else round(undeployed, 2),
        "dscr": None if (d := dscr(noi_annual, annual_debt)) is None else round(d, 2),
        "monthlyCashFlow": round(monthly_cf, 2),
        "annualCashFlow": round(annual_cf, 2),
        "cashOnCash": None if coc is None else round(coc, 4),
        "breakEvenMonths": None
        if (b := break_even_months(cash_invested, monthly_cf)) is None
        else round(b, 1),
        "hysaAnnualYield": round(hysa_annual_yield, 2),
        "cocPremium": None if coc_premium is None else round(coc_premium, 4),
    }
