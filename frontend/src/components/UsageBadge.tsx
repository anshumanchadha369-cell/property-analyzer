import {
  CALLS_PER_ANALYSIS,
  MONTHLY_QUOTA,
  OVERAGE_PER_CALL,
  nextAnalysisOverageCost,
  usageLevel,
} from '../lib/usage'

export default function UsageBadge({ calls }: { calls: number }) {
  const level = usageLevel(calls)
  const remaining = Math.max(0, MONTHLY_QUOTA - calls)
  const analysesLeft = Math.floor(remaining / CALLS_PER_ANALYSIS)

  const styles: Record<string, string> = {
    ok: 'border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
    warn: 'border-amber-500/50 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300',
    'over-soon':
      'border-red-500/50 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300',
    over: 'border-red-500/50 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300',
  }

  const label =
    level === 'over'
      ? `${calls}/${MONTHLY_QUOTA} API calls — in overage`
      : `${calls}/${MONTHLY_QUOTA} API calls`

  const detail =
    level === 'ok'
      ? `≈ ${analysesLeft} free analyses left this period`
      : level === 'warn'
        ? `${remaining} calls left ≈ ${analysesLeft} analyses — approaching the free tier limit`
        : level === 'over-soon'
          ? `next analysis exceeds the free tier: ~$${nextAnalysisOverageCost(calls).toFixed(2)} overage`
          : `each analysis now costs ~$${(CALLS_PER_ANALYSIS * OVERAGE_PER_CALL).toFixed(2)} ($${OVERAGE_PER_CALL.toFixed(2)}/call)`

  return (
    <div
      className={`inline-flex flex-wrap items-baseline gap-x-2 rounded-lg border px-3 py-1.5 text-xs ${styles[level]}`}
      title={`RentCast Developer plan: ${MONTHLY_QUOTA} calls per billing period, then $${OVERAGE_PER_CALL.toFixed(2)}/call. Each analysis uses ${CALLS_PER_ANALYSIS} calls. Tracked on this device — exact usage is on your RentCast dashboard.`}
    >
      <span className="font-medium">{label}</span>
      <span className="opacity-80">{detail}</span>
    </div>
  )
}
