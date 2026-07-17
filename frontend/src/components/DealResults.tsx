import { Card, MetricTile, MoneyRow } from './ui'
import { fmtCurrency, fmtPercent } from '../lib/format'
import {
  computeTargets,
  TARGET_COC,
  TARGET_DSCR,
  type DealSettings,
  type Deployment,
  type TargetPair,
} from '../lib/deal-math'
import type { Metrics } from '../types/analysis'

// v1 product rule: returns below 6% are red, at/above green.
const RETURN_THRESHOLD = 0.06
const THIN_CASH_FLOOR = 5000

function TargetRow({
  label,
  sub,
  met,
  pair,
  currentPrice,
  currentRent,
  unitCount,
}: {
  label: string
  sub: string
  met: boolean
  pair: TargetPair
  currentPrice: number
  currentRent: number
  unitCount: number | null
}) {
  if (met) {
    return (
      <div className="flex items-baseline gap-2 py-1.5">
        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
        <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-xs text-emerald-600 dark:text-emerald-400">already met</span>
      </div>
    )
  }
  const priceDelta =
    pair.maxPrice != null ? ((pair.maxPrice - currentPrice) / currentPrice) * 100 : null
  const rentDelta =
    pair.requiredRent != null ? ((pair.requiredRent - currentRent) / currentRent) * 100 : null
  return (
    <div className="py-1.5">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label} <span className="text-xs font-normal text-slate-500">({sub})</span>
      </p>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
        {pair.maxPrice != null ? (
          <>
            price ≤{' '}
            <span className="font-semibold tabular-nums">{fmtCurrency(pair.maxPrice)}</span>
            <span className="text-xs text-slate-500">
              {' '}
              ({priceDelta! >= 0 ? '+' : ''}
              {priceDelta!.toFixed(0)}% vs current)
            </span>
          </>
        ) : (
          'no viable price at these assumptions'
        )}
        {'  —  or  '}
        {pair.requiredRent != null ? (
          <>
            rent ≥{' '}
            <span className="font-semibold tabular-nums">
              {fmtCurrency(pair.requiredRent)}/mo
            </span>
            <span className="text-xs text-slate-500">
              {' '}
              ({rentDelta! >= 0 ? '+' : ''}
              {rentDelta!.toFixed(0)}%
              {unitCount ? ` · ≈ ${fmtCurrency(pair.requiredRent / unitCount)}/unit` : ''})
            </span>
          </>
        ) : (
          'no viable rent'
        )}
      </p>
    </div>
  )
}

function breakEvenDisplay(months: number | null): string {
  if (months == null) return 'Never'
  if (months < 12) return `${Math.round(months)} mo`
  return `${(months / 12).toFixed(1)} yr`
}

export default function DealResults({
  deployment,
  operating,
  settings,
  unitCount = null,
}: {
  deployment: Deployment | null
  operating: Metrics | null
  settings: DealSettings
  unitCount?: number | null
}) {
  if (!deployment || !operating) {
    return (
      <Card title="Returns & Cash Flow">
        <p className="text-sm text-slate-500">
          Need a purchase price and monthly rent to run the numbers — the fetched estimates are
          missing. Enter them as manual overrides above.
        </p>
      </Card>
    )
  }

  const coc = deployment.cashOnCash
  const cocFlag = coc == null ? undefined : coc >= RETURN_THRESHOLD ? 'good' : 'bad'
  const dscrFlag =
    deployment.dscr == null
      ? undefined
      : deployment.dscr >= 1.25
        ? 'good'
        : deployment.dscr >= 1.0
          ? 'warn'
          : 'bad'
  const cfFlag = deployment.monthlyCashFlow > 0 ? 'good' : 'bad'
  const beFlag = deployment.breakEvenMonths == null ? 'bad' : undefined

  const undeployed = deployment.undeployed
  const undeployedTone =
    undeployed == null
      ? null
      : undeployed < 0
        ? 'short'
        : undeployed < THIN_CASH_FLOOR
          ? 'thin'
          : 'ok'

  const premium = deployment.cocPremium
  const ox = operating.operatingExpenses
  const vacancyAmount = operating.grossScheduledIncome - operating.effectiveGrossIncome

  return (
    <div className="space-y-6">
      <Card
        title="Returns & Cash Flow (with financing)"
        right={
          <span className="text-xs text-slate-500">
            {fmtCurrency(deployment.loanAmount)} loan ·{' '}
            {(settings.interestRate * 100).toFixed(2).replace(/\.?0+$/, '')}% / {settings.loanYears}
            yr · {fmtCurrency(deployment.monthlyPI)}/mo P&I
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricTile
            label="Cash-on-Cash"
            value={fmtPercent(coc)}
            flag={cocFlag}
            sub="derivation below"
          />
          <MetricTile
            label="DSCR"
            value={deployment.dscr == null ? '—' : deployment.dscr.toFixed(2)}
            flag={dscrFlag}
            sub={`NOI ÷ debt service (${fmtCurrency(operating.noi)} ÷ ${fmtCurrency(deployment.annualDebtService)}) · lenders want ≥ 1.25`}
          />
          <MetricTile
            label="Cash Flow"
            value={`${fmtCurrency(deployment.monthlyCashFlow)}/mo`}
            flag={cfFlag}
            sub={`${fmtCurrency(deployment.annualCashFlow)}/yr after debt service`}
          />
          <MetricTile
            label="Break-even"
            value={breakEvenDisplay(deployment.breakEvenMonths)}
            flag={beFlag}
            sub={
              deployment.breakEvenMonths == null
                ? 'negative cash flow never recovers the cash invested'
                : `${fmtCurrency(deployment.cashInvested)} invested ÷ ${fmtCurrency(deployment.monthlyCashFlow)}/mo`
            }
          />
        </div>

        {/* What it would take for this deal to clear each bar */}
        {(() => {
          const targets = computeTargets(operating, settings)
          const metBreakEven = deployment.monthlyCashFlow > 0
          const metDscr = deployment.dscr != null && deployment.dscr >= TARGET_DSCR
          const metCoc = coc != null && coc >= TARGET_COC
          const allMet = metBreakEven && metDscr && metCoc
          return (
            <div
              className={`mt-4 rounded-lg border p-3 ${
                allMet
                  ? 'border-emerald-500/40 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/20'
                  : 'border-sky-500/40 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-950/20'
              }`}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                What would make this deal work
              </h3>
              {allMet ? (
                <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                  ✓ Clears break-even, DSCR {TARGET_DSCR}, and {TARGET_COC * 100}% cash-on-cash at
                  the current inputs.
                </p>
              ) : (
                <div className="mt-1 divide-y divide-slate-200/60 dark:divide-slate-800/60">
                  <TargetRow
                    label="Break-even cash flow"
                    sub="stops losing money monthly"
                    met={metBreakEven}
                    pair={targets.breakEven}
                    currentPrice={operating.price}
                    currentRent={operating.monthlyRent}
                    unitCount={unitCount}
                  />
                  <TargetRow
                    label={`Lender-ready (DSCR ≥ ${TARGET_DSCR})`}
                    sub="rents cover the mortgage with margin"
                    met={metDscr}
                    pair={targets.dscr125}
                    currentPrice={operating.price}
                    currentRent={operating.monthlyRent}
                    unitCount={unitCount}
                  />
                  <TargetRow
                    label={`Your ${TARGET_COC * 100}% cash-on-cash bar`}
                    sub="cash deployed here beats the threshold"
                    met={metCoc}
                    pair={targets.coc6}
                    currentPrice={operating.price}
                    currentRent={operating.monthlyRent}
                    unitCount={unitCount}
                  />
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Each line holds everything else constant: the price target assumes today's rent;
                the rent target assumes today's price. Try them in the overrides above.
              </p>
            </div>
          )
        })()}

        {/* The full derivation, top to bottom — this is where the mortgage enters. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cash flow, built step by step (annual)
            </h3>
            <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <MoneyRow
                label={`Gross scheduled income (${fmtCurrency(operating.monthlyRent)}/mo × 12)`}
                amount={operating.grossScheduledIncome}
              />
              <MoneyRow
                label={`− Vacancy (${fmtPercent(operating.vacancyRate, 0)})`}
                amount={-vacancyAmount}
              />
              <MoneyRow
                label="= Effective gross income"
                amount={operating.effectiveGrossIncome}
                strong
              />
              <MoneyRow
                label="− Property taxes"
                amount={-ox.propertyTaxes}
                estimated={ox.taxesEstimated}
              />
              <MoneyRow
                label="− Insurance"
                amount={-ox.insurance}
                estimated={ox.insuranceEstimated}
              />
              <MoneyRow
                label={`− Property management (${fmtPercent(settings.managementRate, 0)} of EGI)`}
                amount={-ox.management}
              />
              <MoneyRow
                label={`− Maintenance reserve (${fmtPercent(settings.maintenanceRate, 0)} of EGI)`}
                amount={-ox.maintenance}
              />
              {ox.hoa > 0 ? <MoneyRow label="− HOA" amount={-ox.hoa} /> : null}
              <MoneyRow label="= Net operating income (NOI)" amount={operating.noi} strong />
              <MoneyRow
                label={`− Debt service (${fmtCurrency(deployment.monthlyPI)}/mo × 12)`}
                amount={-deployment.annualDebtService}
              />
              <MoneyRow
                label="= Annual cash flow"
                amount={deployment.annualCashFlow}
                strong
                negative={deployment.annualCashFlow < 0}
              />
              <div className="flex justify-between py-1.5 text-xs text-slate-500">
                <span>monthly</span>
                <span className="tabular-nums">{fmtCurrency(deployment.monthlyCashFlow)}/mo</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cash-on-cash, step by step
            </h3>
            <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <MoneyRow
                label={`Down payment (${Math.round(settings.downPct * 100)}% of ${fmtCurrency(operating.price)})`}
                amount={deployment.downPayment}
              />
              <MoneyRow
                label={`+ Closing costs (${(settings.closingPct * 100).toFixed(1)}%)`}
                amount={deployment.closingCosts}
                estimated
              />
              {deployment.rehabBudget > 0 ? (
                <MoneyRow label="+ Rehab budget" amount={deployment.rehabBudget} />
              ) : null}
              <MoneyRow label="= Cash invested" amount={deployment.cashInvested} strong />
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-slate-600 dark:text-slate-300">
                Cash-on-cash = annual cash flow ÷ cash invested
              </p>
              <p className="mt-1 font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {fmtCurrency(deployment.annualCashFlow)} ÷ {fmtCurrency(deployment.cashInvested)} ={' '}
                <span
                  className={
                    cocFlag === 'good'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                >
                  {fmtPercent(coc)}
                </span>
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Reserve ({fmtCurrency(deployment.reserve)}) is cash you must bring but stays yours —
                it's excluded from the return denominator. Full allocation in Cash Deployment below.
              </p>
            </div>
            <div
              className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${
                premium != null && premium < 0
                  ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-950/20 dark:text-red-300'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400'
              }`}
            >
              {coc == null ? (
                'Cash-on-cash unavailable.'
              ) : (
                <>
                  {fmtCurrency(deployment.cashInvested)} deployed here returns{' '}
                  <span className="font-semibold">{fmtPercent(coc)}</span> vs{' '}
                  {fmtPercent(settings.hysaRate)} in a HYSA (
                  {fmtCurrency(deployment.hysaAnnualYield)}/yr).{' '}
                  {premium != null && premium >= 0 ? (
                    <>
                      Premium for the risk:{' '}
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        +{(premium * 100).toFixed(1)} pts
                      </span>
                    </>
                  ) : (
                    <span className="font-semibold">
                      The HYSA beats this deal — no risk premium.
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Cash Deployment">
        <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <MoneyRow
            label={`Down payment (${Math.round(settings.downPct * 100)}%)`}
            amount={deployment.downPayment}
          />
          <MoneyRow
            label={`Closing costs (${(settings.closingPct * 100).toFixed(1)}%)`}
            amount={deployment.closingCosts}
            estimated
          />
          {deployment.rehabBudget > 0 ? (
            <MoneyRow label="Rehab budget" amount={deployment.rehabBudget} />
          ) : null}
          <MoneyRow
            label={`Reserve (${settings.reserveMonths} mo opex + debt)`}
            amount={deployment.reserve}
          />
          <MoneyRow label="Total cash required" amount={deployment.totalRequired} strong />
          {undeployed != null ? (
            <div
              className={`flex justify-between py-1.5 font-semibold ${
                undeployedTone === 'short'
                  ? 'text-red-600 dark:text-red-400'
                  : undeployedTone === 'thin'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <span>
                {undeployedTone === 'short'
                  ? `Short by ${fmtCurrency(Math.abs(undeployed))}`
                  : 'Remaining undeployed'}
                {undeployedTone === 'thin' ? (
                  <span className="ml-1.5 text-xs font-normal">(thin reserves)</span>
                ) : null}
              </span>
              <span className="tabular-nums">
                {undeployedTone === 'short' ? '—' : fmtCurrency(undeployed)}
              </span>
            </div>
          ) : (
            <p className="py-1.5 text-xs text-slate-500">
              Enter your available cash to see what's left after this deal.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
