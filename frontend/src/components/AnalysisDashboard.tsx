import type { AnalysisResult, SourceStatus } from '../types/analysis'
import { fmtCurrency, fmtDate, fmtNumber, fmtPercent } from '../lib/format'

// v1 product rule: returns below 6% are flagged red, at/above are green.
const RETURN_THRESHOLD = 0.06

const SOURCE_LABELS: Record<string, string> = {
  rentcast_property: 'Property records',
  rentcast_value: 'Value estimate',
  rentcast_rent: 'Rent estimate',
}

function Card({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm text-slate-200">{value}</p>
    </div>
  )
}

function Unavailable({ what, source }: { what: string; source?: SourceStatus }) {
  const reason =
    source?.status === 'error'
      ? 'source error'
      : source?.status === 'no_data'
        ? 'no data for this address'
        : 'unavailable'
  return (
    <p className="text-sm text-slate-500">
      {what} {reason}.
      {source?.detail ? <span className="mt-1 block text-xs text-slate-600">{source.detail}</span> : null}
    </p>
  )
}

function MetricTile({
  label,
  value,
  flag,
  sub,
}: {
  label: string
  value: string
  flag?: 'good' | 'bad'
  sub?: string
}) {
  const valueColor =
    flag === 'good' ? 'text-emerald-400' : flag === 'bad' ? 'text-red-400' : 'text-slate-100'
  const border =
    flag === 'good'
      ? 'border-emerald-500/30'
      : flag === 'bad'
        ? 'border-red-500/30'
        : 'border-slate-800'
  return (
    <div className={`rounded-lg border ${border} bg-slate-950/60 p-4`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueColor}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  )
}

function ExpenseRow({
  label,
  amount,
  estimated,
  strong,
}: {
  label: string
  amount: number
  estimated?: boolean
  strong?: boolean
}) {
  return (
    <div className={`flex justify-between py-1.5 ${strong ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
      <span>
        {label}
        {estimated ? <span className="ml-1.5 text-xs text-amber-400/80">(est.)</span> : null}
      </span>
      <span className="tabular-nums">{fmtCurrency(amount)}</span>
    </div>
  )
}

function SourceBadges({
  sources,
  fetchedAt,
}: {
  sources: Record<string, SourceStatus>
  fetchedAt: string
}) {
  const dot = (s: SourceStatus) =>
    s.status === 'ok' ? 'bg-emerald-400' : s.status === 'no_data' ? 'bg-slate-500' : 'bg-red-400'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
      {Object.entries(sources).map(([key, s]) => (
        <span key={key} className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot(s)}`} />
          {SOURCE_LABELS[key] ?? key}
          {s.status === 'ok' && s.freshness ? ` · ${s.freshness}` : ` · ${s.status}`}
        </span>
      ))}
      <span className="ml-auto">fetched {fmtDate(fetchedAt)}</span>
    </div>
  )
}

export default function AnalysisDashboard({ result }: { result: AnalysisResult }) {
  const { property, valuation, rental, metrics, meta } = result

  return (
    <div className="space-y-6">
      <Card title="Property">
        {property ? (
          <>
            <p className="text-lg font-medium text-slate-100">{property.formattedAddress}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <LabelValue label="Type" value={property.propertyType ?? '—'} />
              <LabelValue label="Units" value={fmtNumber(property.unitCount)} />
              <LabelValue
                label="Beds / Baths"
                value={`${fmtNumber(property.bedrooms)} / ${fmtNumber(property.bathrooms)}`}
              />
              <LabelValue label="Sq Ft" value={fmtNumber(property.squareFootage)} />
              <LabelValue label="Lot (sq ft)" value={fmtNumber(property.lotSize)} />
              <LabelValue label="Year Built" value={property.yearBuilt ? String(property.yearBuilt) : '—'} />
              <LabelValue
                label="Last Sale"
                value={
                  property.lastSalePrice
                    ? `${fmtCurrency(property.lastSalePrice)} · ${fmtDate(property.lastSaleDate)}`
                    : '—'
                }
              />
              <LabelValue label="County" value={property.county ?? '—'} />
            </div>
          </>
        ) : (
          <Unavailable what="Property records" source={meta.sources.rentcast_property} />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Estimated Value">
          {valuation?.value != null ? (
            <>
              <p className="text-3xl font-semibold text-slate-100">{fmtCurrency(valuation.value)}</p>
              <p className="mt-1 text-sm text-slate-400">
                range {fmtCurrency(valuation.valueRangeLow)} – {fmtCurrency(valuation.valueRangeHigh)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <LabelValue label="Per Sq Ft" value={fmtCurrency(metrics?.pricePerSqft, 0)} />
                <LabelValue label="Per Unit" value={fmtCurrency(metrics?.pricePerUnit)} />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                based on {valuation.comparables.length} sale comparables
              </p>
            </>
          ) : (
            <Unavailable what="Value estimate" source={meta.sources.rentcast_value} />
          )}
        </Card>

        <Card title="Estimated Rent">
          {rental?.rent != null ? (
            <>
              <p className="text-3xl font-semibold text-slate-100">
                {fmtCurrency(rental.rent)}
                <span className="text-base font-normal text-slate-400"> / mo</span>
              </p>
              <p className="mt-1 text-sm text-slate-400">
                range {fmtCurrency(rental.rentRangeLow)} – {fmtCurrency(rental.rentRangeHigh)}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                based on {rental.comparables.length} rental comparables
              </p>
            </>
          ) : (
            <Unavailable what="Rent estimate" source={meta.sources.rentcast_rent} />
          )}
        </Card>
      </div>

      <Card
        title="Investment Metrics"
        right={<span className="text-xs text-slate-500">flag threshold ≥ {RETURN_THRESHOLD * 100}%</span>}
      >
        {metrics ? (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <MetricTile
                label="Cap Rate"
                value={fmtPercent(metrics.capRate)}
                flag={
                  metrics.capRate == null
                    ? undefined
                    : metrics.capRate >= RETURN_THRESHOLD
                      ? 'good'
                      : 'bad'
                }
                sub="NOI / value"
              />
              <MetricTile label="NOI" value={fmtCurrency(metrics.noi)} sub="annual" />
              <MetricTile label="GRM" value={fmtNumber(metrics.grm, 1)} sub="value / gross rent" />
              <MetricTile
                label="1% Rule"
                value={metrics.onePercentRule.passes ? 'Pass' : 'Fail'}
                flag={metrics.onePercentRule.passes ? 'good' : 'bad'}
                sub={`rent/price ${fmtPercent(metrics.onePercentRule.ratio)}`}
              />
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Income (annual)
                </h3>
                <div className="divide-y divide-slate-800 text-sm">
                  <ExpenseRow label="Gross scheduled income" amount={metrics.grossScheduledIncome} />
                  <ExpenseRow
                    label={`Vacancy (${fmtPercent(metrics.vacancyRate, 0)})`}
                    amount={-(metrics.grossScheduledIncome - metrics.effectiveGrossIncome)}
                  />
                  <ExpenseRow label="Effective gross income" amount={metrics.effectiveGrossIncome} strong />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Operating Expenses (annual)
                </h3>
                <div className="divide-y divide-slate-800 text-sm">
                  <ExpenseRow
                    label="Property taxes"
                    amount={metrics.operatingExpenses.propertyTaxes}
                    estimated={metrics.operatingExpenses.taxesEstimated}
                  />
                  <ExpenseRow
                    label="Insurance"
                    amount={metrics.operatingExpenses.insurance}
                    estimated={metrics.operatingExpenses.insuranceEstimated}
                  />
                  <ExpenseRow label="Management (10%)" amount={metrics.operatingExpenses.management} />
                  <ExpenseRow label="Maintenance (10%)" amount={metrics.operatingExpenses.maintenance} />
                  {metrics.operatingExpenses.hoa > 0 ? (
                    <ExpenseRow label="HOA" amount={metrics.operatingExpenses.hoa} />
                  ) : null}
                  <ExpenseRow label="Total expenses" amount={metrics.operatingExpenses.total} strong />
                  <ExpenseRow label="Net operating income" amount={metrics.noi} strong />
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Metrics unavailable — {meta.metricsUnavailableReason ?? 'insufficient data'}.
          </p>
        )}
      </Card>

      <SourceBadges sources={meta.sources} fetchedAt={meta.fetchedAt} />
    </div>
  )
}
