import { Card, MetricTile, MoneyRow } from './ui'
import { fmtCurrency, fmtPercent } from '../lib/format'
import type { DealSettings, Deployment } from '../lib/deal-math'
import type { Metrics } from '../types/analysis'

// v1 product rule: returns below 6% are red, at/above green.
const RETURN_THRESHOLD = 0.06
const THIN_CASH_FLOOR = 5000

function breakEvenDisplay(months: number | null): string {
  if (months == null) return 'Never'
  if (months < 12) return `${Math.round(months)} mo`
  return `${(months / 12).toFixed(1)} yr`
}

export default function DealResults({
  deployment,
  operating,
  settings,
}: {
  deployment: Deployment | null
  operating: Metrics | null
  settings: DealSettings
}) {
  if (!deployment || !operating) {
    return (
      <Card title="Cash Deployment">
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card
        title="Returns (with financing)"
        right={
          <span className="text-xs text-slate-500">
            {fmtCurrency(deployment.loanAmount)} loan · {fmtCurrency(deployment.monthlyPI)}/mo P&I
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <MetricTile
            label="Cash-on-Cash"
            value={fmtPercent(coc)}
            flag={cocFlag}
            sub={`annual cash flow / ${fmtCurrency(deployment.cashInvested)} invested`}
          />
          <MetricTile
            label="DSCR"
            value={deployment.dscr == null ? '—' : deployment.dscr.toFixed(2)}
            flag={dscrFlag}
            sub="NOI / debt service · lenders want ≥ 1.25"
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
            sub="cash flow recovers cash invested"
          />
        </div>
      </Card>

      <Card title="Cash Deployment">
        <div className="divide-y divide-slate-800 text-sm">
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
                  ? 'text-red-400'
                  : undeployedTone === 'thin'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
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

        <div
          className={`mt-4 rounded-lg border p-3 text-xs leading-relaxed ${
            premium != null && premium < 0
              ? 'border-red-500/30 bg-red-950/20 text-red-300'
              : 'border-slate-800 bg-slate-950/60 text-slate-400'
          }`}
        >
          {coc == null ? (
            'Cash-on-cash unavailable.'
          ) : (
            <>
              {fmtCurrency(deployment.cashInvested)} deployed here returns{' '}
              <span className="font-semibold">{fmtPercent(coc)}</span> vs{' '}
              {fmtPercent(settings.hysaRate)} in a HYSA ({fmtCurrency(deployment.hysaAnnualYield)}
              /yr).{' '}
              {premium != null && premium >= 0 ? (
                <>
                  Premium for the risk:{' '}
                  <span className="font-semibold text-emerald-400">
                    +{(premium * 100).toFixed(1)} pts
                  </span>
                </>
              ) : (
                <span className="font-semibold">The HYSA beats this deal — no risk premium.</span>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
