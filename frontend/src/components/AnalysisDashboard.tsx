import type { AnalysisResult, Metrics, SourceStatus } from '../types/analysis'
import { fmtCurrency, fmtDate, fmtNumber, fmtPercent } from '../lib/format'
import { Card, LabelValue, MetricTile, MoneyRow } from './ui'

// v1 product rule: returns below 6% are flagged red, at/above are green.
const RETURN_THRESHOLD = 0.06

const SOURCE_LABELS: Record<string, string> = {
  rentcast_property: 'Property records',
  rentcast_value: 'Value estimate',
  rentcast_rent: 'Rent estimate',
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
      {source?.detail ? (
        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-600">
          {source.detail}
        </span>
      ) : null}
    </p>
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
    s.status === 'ok'
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : s.status === 'no_data'
        ? 'bg-slate-400 dark:bg-slate-500'
        : 'bg-red-500 dark:bg-red-400'
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

export default function AnalysisDashboard({
  result,
  metrics,
  overridesActive = false,
}: {
  result: AnalysisResult
  metrics: Metrics | null
  overridesActive?: boolean
}) {
  const { property, valuation, rental, meta } = result

  return (
    <div className="space-y-6">
      <Card title="Property">
        {property ? (
          <>
            <p className="text-lg font-medium text-slate-900 dark:text-slate-100">
              {property.formattedAddress}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <LabelValue label="Type" value={property.propertyType ?? '—'} />
              <LabelValue label="Units" value={fmtNumber(property.unitCount)} />
              <LabelValue
                label="Beds / Baths"
                value={`${fmtNumber(property.bedrooms)} / ${fmtNumber(property.bathrooms)}`}
              />
              <LabelValue label="Sq Ft" value={fmtNumber(property.squareFootage)} />
              <LabelValue label="Lot (sq ft)" value={fmtNumber(property.lotSize)} />
              <LabelValue
                label="Year Built"
                value={property.yearBuilt ? String(property.yearBuilt) : '—'}
              />
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
              <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                {fmtCurrency(valuation.value)}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
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
              <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                {fmtCurrency(rental.rent)}
                <span className="text-base font-normal text-slate-500 dark:text-slate-400">
                  {' '}
                  / mo
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
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
        right={
          <span className="text-xs text-slate-500">
            {overridesActive ? (
              <span className="mr-2 rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                using manual inputs
              </span>
            ) : null}
            flag threshold ≥ {RETURN_THRESHOLD * 100}%
          </span>
        }
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
                sub="NOI / price"
              />
              <MetricTile label="NOI" value={fmtCurrency(metrics.noi)} sub="annual" />
              <MetricTile label="GRM" value={fmtNumber(metrics.grm, 1)} sub="price / gross rent" />
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
                <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  <MoneyRow label="Gross scheduled income" amount={metrics.grossScheduledIncome} />
                  <MoneyRow
                    label={`Vacancy (${fmtPercent(metrics.vacancyRate, 0)})`}
                    amount={-(metrics.grossScheduledIncome - metrics.effectiveGrossIncome)}
                  />
                  <MoneyRow label="Effective gross income" amount={metrics.effectiveGrossIncome} strong />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Operating Expenses (annual)
                </h3>
                <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  <MoneyRow
                    label="Property taxes"
                    amount={metrics.operatingExpenses.propertyTaxes}
                    estimated={metrics.operatingExpenses.taxesEstimated}
                  />
                  <MoneyRow
                    label="Insurance"
                    amount={metrics.operatingExpenses.insurance}
                    estimated={metrics.operatingExpenses.insuranceEstimated}
                  />
                  <MoneyRow
                    label={`Management (${fmtPercent(metrics.operatingExpenses.management / Math.max(metrics.effectiveGrossIncome, 1), 0)})`}
                    amount={metrics.operatingExpenses.management}
                  />
                  <MoneyRow
                    label={`Maintenance (${fmtPercent(metrics.operatingExpenses.maintenance / Math.max(metrics.effectiveGrossIncome, 1), 0)})`}
                    amount={metrics.operatingExpenses.maintenance}
                  />
                  {metrics.operatingExpenses.hoa > 0 ? (
                    <MoneyRow label="HOA" amount={metrics.operatingExpenses.hoa} />
                  ) : null}
                  <MoneyRow label="Total expenses" amount={metrics.operatingExpenses.total} strong />
                  <MoneyRow label="Net operating income" amount={metrics.noi} strong />
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Metrics unavailable — {meta.metricsUnavailableReason ?? 'missing price or rent'}. Enter
            manual overrides above to compute them.
          </p>
        )}
      </Card>

      <SourceBadges sources={meta.sources} fetchedAt={meta.fetchedAt} />
    </div>
  )
}
