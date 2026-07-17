// Client-side deal math — mirror of backend app/calculations/{investment_metrics,cash_deployment}.py.
// Keep formulas and defaults in sync with the tested Python reference.

import type { AnalysisResult, Metrics } from '../types/analysis'

export type LoanType = 'conventional' | 'dscr' | 'commercial'

export const LOAN_PRESETS: Record<LoanType, { label: string; rate: number; years: number; downPct: number }> = {
  conventional: { label: 'Conventional', rate: 0.07, years: 30, downPct: 0.25 },
  dscr: { label: 'DSCR', rate: 0.075, years: 30, downPct: 0.25 },
  commercial: { label: 'Commercial', rate: 0.0725, years: 25, downPct: 0.3 },
}

export interface DealSettings {
  availableCash: number | null
  loanType: LoanType
  downPct: number
  interestRate: number
  loanYears: number
  closingPct: number
  rehabBudget: number
  reserveMonths: number
  vacancyRate: number
  managementRate: number
  maintenanceRate: number
  hysaRate: number
}

export const DEFAULT_SETTINGS: DealSettings = {
  availableCash: null,
  loanType: 'conventional',
  downPct: 0.25,
  interestRate: 0.07,
  loanYears: 30,
  closingPct: 0.03,
  rehabBudget: 0,
  reserveMonths: 3,
  vacancyRate: 0.05,
  managementRate: 0.1,
  maintenanceRate: 0.1,
  hysaRate: 0.04,
}

export interface Overrides {
  price: number | null
  monthlyRent: number | null
  unitCount: number | null
  annualTaxes: number | null
}

export const EMPTY_OVERRIDES: Overrides = {
  price: null,
  monthlyRent: null,
  unitCount: null,
  annualTaxes: null,
}

const SETTINGS_KEY = 'deal-settings-v1'

export function loadSettings(): DealSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_SETTINGS
}

export function saveSettings(s: DealSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

/** Effective base inputs: manual overrides win over fetched estimates. */
export interface BaseInputs {
  price: number | null
  monthlyRent: number | null
  unitCount: number | null
  annualTaxes: number | null // null → estimate from price
  squareFootage: number | null
}

export function deriveBase(result: AnalysisResult, o: Overrides): BaseInputs {
  const serverTaxes =
    result.metrics && !result.metrics.operatingExpenses.taxesEstimated
      ? result.metrics.operatingExpenses.propertyTaxes
      : null
  return {
    price: o.price ?? result.valuation?.value ?? null,
    monthlyRent: o.monthlyRent ?? result.rental?.rent ?? null,
    unitCount: o.unitCount ?? result.property?.unitCount ?? null,
    annualTaxes: o.annualTaxes ?? serverTaxes,
    squareFootage: result.property?.squareFootage ?? null,
  }
}

// ---- operating metrics (mirror of investment_metrics.compute_metrics) ----

const INSURANCE_RATE_OF_VALUE = 0.005
const TAX_RATE_OF_VALUE = 0.01
const ONE_PERCENT_THRESHOLD = 0.01

const r2 = (n: number) => Math.round(n * 100) / 100
const r4 = (n: number) => Math.round(n * 10000) / 10000

export function computeOperating(base: BaseInputs, s: DealSettings): Metrics | null {
  const price = base.price
  const monthlyRent = base.monthlyRent
  if (!price || !monthlyRent || price <= 0 || monthlyRent <= 0) return null

  const gsi = monthlyRent * 12
  const egi = gsi * (1 - s.vacancyRate)
  const taxesEstimated = base.annualTaxes == null
  const taxes = base.annualTaxes ?? price * TAX_RATE_OF_VALUE
  const insurance = price * INSURANCE_RATE_OF_VALUE
  const management = egi * s.managementRate
  const maintenance = egi * s.maintenanceRate
  const totalExpenses = taxes + insurance + management + maintenance
  const noi = egi - totalExpenses
  const ratio = monthlyRent / price

  return {
    price: r2(price),
    monthlyRent: r2(monthlyRent),
    grossScheduledIncome: r2(gsi),
    vacancyRate: s.vacancyRate,
    effectiveGrossIncome: r2(egi),
    operatingExpenses: {
      propertyTaxes: r2(taxes),
      taxesEstimated,
      insurance: r2(insurance),
      insuranceEstimated: true,
      management: r2(management),
      maintenance: r2(maintenance),
      hoa: 0,
      total: r2(totalExpenses),
    },
    noi: r2(noi),
    capRate: r4(noi / price),
    grm: r4(price / gsi),
    onePercentRule: { ratio: r4(ratio), passes: ratio >= ONE_PERCENT_THRESHOLD },
    pricePerSqft: base.squareFootage ? r2(price / base.squareFootage) : null,
    pricePerUnit: base.unitCount ? r2(price / base.unitCount) : null,
  }
}

// ---- financing & deployment (mirror of cash_deployment.py) ----

export interface Deployment {
  downPayment: number
  loanAmount: number
  monthlyPI: number
  annualDebtService: number
  closingCosts: number
  rehabBudget: number
  reserve: number
  cashInvested: number
  totalRequired: number
  undeployed: number | null
  dscr: number | null
  monthlyCashFlow: number
  annualCashFlow: number
  cashOnCash: number | null
  breakEvenMonths: number | null
  hysaAnnualYield: number
  cocPremium: number | null
}

export interface TargetPair {
  maxPrice: number | null
  requiredRent: number | null
}

export interface Targets {
  breakEven: TargetPair
  dscr125: TargetPair
  coc6: TargetPair
}

export const TARGET_DSCR = 1.25
export const TARGET_COC = 0.06

// Closed-form "what would make this deal work" targets. Mirror of
// backend/app/calculations/cash_deployment.py compute_targets — keep in sync.
export function computeTargets(operating: Metrics, s: DealSettings): Targets {
  const rentFactor = 12 * (1 - s.vacancyRate) * (1 - s.managementRate - s.maintenanceRate)
  const empty = (): TargetPair => ({ maxPrice: null, requiredRent: null })
  if (rentFactor <= 0 || operating.price <= 0 || operating.monthlyRent <= 0) {
    return { breakEven: empty(), dscr125: empty(), coc6: empty() }
  }
  const taxesEstimated = operating.operatingExpenses.taxesEstimated
  const c = INSURANCE_RATE_OF_VALUE + (taxesEstimated ? TAX_RATE_OF_VALUE : 0)
  const t0 = taxesEstimated ? 0 : operating.operatingExpenses.propertyTaxes
  const a = rentFactor * operating.monthlyRent
  const ads1 = monthlyMortgagePayment(1 - s.downPct, s.interestRate, s.loanYears) * 12

  const solve = (debtMultiplier: number, cocTarget: number): TargetPair => {
    const denom = c + debtMultiplier * ads1 + cocTarget * (s.downPct + s.closingPct)
    const numer = a - t0 - cocTarget * s.rehabBudget
    const maxPrice =
      denom > 0 && numer > 0 ? Math.floor(numer / denom / 500) * 500 : null
    const need =
      c * operating.price +
      t0 +
      debtMultiplier * ads1 * operating.price +
      cocTarget * ((s.downPct + s.closingPct) * operating.price + s.rehabBudget)
    const requiredRent = need > 0 ? Math.ceil(need / rentFactor / 5) * 5 : null
    return { maxPrice, requiredRent }
  }

  return {
    breakEven: solve(1, 0),
    dscr125: solve(TARGET_DSCR, 0),
    coc6: solve(1, TARGET_COC),
  }
}

export function monthlyMortgagePayment(loan: number, annualRate: number, years: number): number {
  const n = years * 12
  if (n <= 0 || loan <= 0) return 0
  if (annualRate <= 0) return loan / n
  const r = annualRate / 12
  const factor = Math.pow(1 + r, n)
  return (loan * r * factor) / (factor - 1)
}

export function computeDeployment(price: number, operating: Metrics, s: DealSettings): Deployment {
  const downPayment = price * s.downPct
  const loanAmount = price - downPayment
  const monthlyPI = monthlyMortgagePayment(loanAmount, s.interestRate, s.loanYears)
  const annualDebtService = monthlyPI * 12

  const closingCosts = price * s.closingPct
  const monthlyOpex = operating.operatingExpenses.total / 12
  const reserve = s.reserveMonths * (monthlyOpex + monthlyPI)

  const cashInvested = downPayment + closingCosts + s.rehabBudget
  const totalRequired = cashInvested + reserve

  const annualCashFlow = operating.noi - annualDebtService
  const monthlyCashFlow = annualCashFlow / 12
  const cashOnCash = cashInvested > 0 ? annualCashFlow / cashInvested : null
  const undeployed = s.availableCash == null ? null : s.availableCash - totalRequired
  const breakEvenMonths =
    monthlyCashFlow > 0 && cashInvested > 0 ? cashInvested / monthlyCashFlow : null

  return {
    downPayment: r2(downPayment),
    loanAmount: r2(loanAmount),
    monthlyPI: r2(monthlyPI),
    annualDebtService: r2(annualDebtService),
    closingCosts: r2(closingCosts),
    rehabBudget: r2(s.rehabBudget),
    reserve: r2(reserve),
    cashInvested: r2(cashInvested),
    totalRequired: r2(totalRequired),
    undeployed: undeployed == null ? null : r2(undeployed),
    dscr: annualDebtService > 0 ? r2(operating.noi / annualDebtService) : null,
    monthlyCashFlow: r2(monthlyCashFlow),
    annualCashFlow: r2(annualCashFlow),
    cashOnCash: cashOnCash == null ? null : r4(cashOnCash),
    breakEvenMonths: breakEvenMonths == null ? null : Math.round(breakEvenMonths * 10) / 10,
    hysaAnnualYield: r2(cashInvested * s.hysaRate),
    cocPremium: cashOnCash == null ? null : r4(cashOnCash - s.hysaRate),
  }
}
