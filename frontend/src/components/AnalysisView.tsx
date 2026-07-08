import { useEffect, useMemo, useState } from 'react'
import AnalysisDashboard from './AnalysisDashboard'
import DealInputs from './DealInputs'
import DealResults from './DealResults'
import {
  EMPTY_OVERRIDES,
  computeDeployment,
  computeOperating,
  deriveBase,
  loadSettings,
  saveSettings,
  type DealSettings,
  type Overrides,
} from '../lib/deal-math'
import type { SavedSummary } from '../lib/db'
import type { AnalysisResult } from '../types/analysis'

export interface SavePayload {
  address: string
  overrides: Overrides
  settings: DealSettings
  summary: SavedSummary
}

export default function AnalysisView({
  result,
  initialOverrides,
  initialSettings,
  saved,
  onSave,
}: {
  result: AnalysisResult
  initialOverrides?: Overrides
  initialSettings?: DealSettings
  saved: boolean
  onSave: (payload: SavePayload) => void
}) {
  const [settings, setSettings] = useState<DealSettings>(() => initialSettings ?? loadSettings())
  const [overrides, setOverrides] = useState<Overrides>(initialOverrides ?? EMPTY_OVERRIDES)

  useEffect(() => saveSettings(settings), [settings])

  const base = useMemo(() => deriveBase(result, overrides), [result, overrides])
  const operating = useMemo(() => computeOperating(base, settings), [base, settings])
  const deployment = useMemo(
    () => (operating && base.price ? computeDeployment(base.price, operating, settings) : null),
    [base.price, operating, settings],
  )

  const overridesActive = Object.values(overrides).some((v) => v != null)

  function handleSave() {
    onSave({
      address: result.property?.formattedAddress ?? result.meta.address,
      overrides,
      settings,
      summary: {
        unitCount: base.unitCount,
        price: base.price,
        capRate: operating?.capRate ?? null,
        cashOnCash: deployment?.cashOnCash ?? null,
        monthlyCashFlow: deployment?.monthlyCashFlow ?? null,
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-3">
        {saved ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ saved — updates apply on save
          </span>
        ) : null}
        <button
          onClick={handleSave}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          title="Persist this analysis locally (and sync when configured). Loading it later costs no API calls."
        >
          {saved ? 'Update saved analysis' : 'Save analysis'}
        </button>
      </div>
      <DealInputs
        settings={settings}
        onSettings={setSettings}
        overrides={overrides}
        onOverrides={setOverrides}
        fetched={{
          price: result.valuation?.value ?? null,
          rent: result.rental?.rent ?? null,
          units: result.property?.unitCount ?? null,
          taxes:
            result.metrics && !result.metrics.operatingExpenses.taxesEstimated
              ? result.metrics.operatingExpenses.propertyTaxes
              : null,
        }}
      />
      <DealResults deployment={deployment} operating={operating} settings={settings} />
      <AnalysisDashboard
        result={result}
        metrics={operating ?? result.metrics}
        overridesActive={overridesActive}
        effectiveUnitCount={base.unitCount}
      />
    </div>
  )
}
