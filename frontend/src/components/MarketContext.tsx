import type { AnalysisResult, SourceStatus } from '../types/analysis'
import { fmtCurrency, fmtNumber } from '../lib/format'
import { Card } from './ui'

function SectionUnavailable({ source }: { source?: SourceStatus }) {
  if (source?.status === 'not_configured') {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        Requires a free API key — see README. The rest of the analysis is unaffected.
      </p>
    )
  }
  return (
    <p className="text-xs text-slate-500">
      {source?.status === 'error' ? 'Source error.' : 'No data for this location.'}
    </p>
  )
}

const BR_LABELS: [keyof NonNullable<AnalysisResult['marketRent']>['rents'], string][] = [
  ['efficiency', 'Studio'],
  ['oneBr', '1 BR'],
  ['twoBr', '2 BR'],
  ['threeBr', '3 BR'],
  ['fourBr', '4 BR'],
]

export default function MarketContext({
  result,
  monthlyRent,
  unitCount,
}: {
  result: AnalysisResult
  monthlyRent: number | null
  unitCount: number | null
}) {
  const { marketRent, risk, demographics, meta } = result
  const perUnitRent = monthlyRent && unitCount ? monthlyRent / unitCount : null
  const fmr2br = marketRent?.rents.twoBr ?? null
  const fmrDelta =
    perUnitRent != null && fmr2br != null && fmr2br > 0 ? perUnitRent / fmr2br - 1 : null

  return (
    <Card title="Market Context & Risk">
      <div className="grid gap-6 md:grid-cols-3">
        {/* HUD Fair Market Rent */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            HUD Fair Market Rent{marketRent?.year ? ` · FY${marketRent.year}` : ''}
          </h3>
          {marketRent ? (
            <>
              <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {BR_LABELS.map(([key, label]) => (
                  <div key={key} className="flex justify-between py-1">
                    <span className="text-slate-500">{label}</span>
                    <span className="tabular-nums text-slate-700 dark:text-slate-200">
                      {fmtCurrency(marketRent.rents[key])}
                    </span>
                  </div>
                ))}
              </div>
              {fmrDelta != null ? (
                <p className="mt-2 text-xs text-slate-500">
                  Per-unit rent {fmtCurrency(perUnitRent)} is{' '}
                  <span
                    className={
                      fmrDelta < -0.05
                        ? 'font-medium text-emerald-600 dark:text-emerald-400'
                        : fmrDelta > 0.1
                          ? 'font-medium text-amber-600 dark:text-amber-400'
                          : 'font-medium text-slate-600 dark:text-slate-300'
                    }
                  >
                    {fmrDelta >= 0 ? '+' : ''}
                    {(fmrDelta * 100).toFixed(0)}%
                  </span>{' '}
                  vs the 2BR FMR — {fmrDelta < -0.05 ? 'possible upside' : fmrDelta > 0.1 ? 'above market baseline' : 'in line with market'}.
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-600">
                {marketRent.metroName ?? ''} · 40th-percentile gross rent · annual
              </p>
            </>
          ) : (
            <SectionUnavailable source={meta.sources.hud_fmr} />
          )}
        </div>

        {/* FEMA flood */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Flood Risk (FEMA)
          </h3>
          {risk ? (
            <>
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  risk.isHighRisk
                    ? 'border-red-500/50 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300'
                    : 'border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                }`}
              >
                Zone {risk.floodZone}
                {risk.isHighRisk ? ' — high risk' : ' — minimal risk'}
              </span>
              <p className="mt-2 text-xs text-slate-500">
                {risk.zoneSubtype ?? (risk.isHighRisk ? 'Special Flood Hazard Area' : '')}
              </p>
              {risk.isHighRisk ? (
                <p className="mt-1 text-xs text-red-600/90 dark:text-red-400/90">
                  Flood insurance likely required by lenders — budget for it.
                </p>
              ) : null}
            </>
          ) : (
            <SectionUnavailable source={meta.sources.fema_flood} />
          )}
        </div>

        {/* Census demographics */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Area Demographics{demographics ? ` · ACS ${demographics.acsYear}` : ''}
          </h3>
          {demographics ? (
            <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">ZIP population</span>
                <span className="tabular-nums text-slate-700 dark:text-slate-200">
                  {fmtNumber(demographics.population)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Median household income</span>
                <span className="tabular-nums text-slate-700 dark:text-slate-200">
                  {fmtCurrency(demographics.medianHouseholdIncome)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Median gross rent</span>
                <span className="tabular-nums text-slate-700 dark:text-slate-200">
                  {fmtCurrency(demographics.medianGrossRent)}
                </span>
              </div>
            </div>
          ) : (
            <SectionUnavailable source={meta.sources.census_acs} />
          )}
        </div>
      </div>
    </Card>
  )
}
