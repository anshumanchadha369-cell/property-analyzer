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
import type { AnalysisResult } from '../types/analysis'

export default function AnalysisView({ result }: { result: AnalysisResult }) {
  const [settings, setSettings] = useState<DealSettings>(() => loadSettings())
  const [overrides, setOverrides] = useState<Overrides>(EMPTY_OVERRIDES)

  useEffect(() => saveSettings(settings), [settings])
  // A new analysis means new fetched data — clear property-specific overrides.
  useEffect(() => setOverrides(EMPTY_OVERRIDES), [result.meta.fetchedAt])

  const base = useMemo(() => deriveBase(result, overrides), [result, overrides])
  const operating = useMemo(() => computeOperating(base, settings), [base, settings])
  const deployment = useMemo(
    () => (operating && base.price ? computeDeployment(base.price, operating, settings) : null),
    [base.price, operating, settings],
  )

  const overridesActive = Object.values(overrides).some((v) => v != null)

  return (
    <div className="space-y-6">
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
      />
    </div>
  )
}
