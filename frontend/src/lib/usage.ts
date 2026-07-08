// RentCast Developer plan facts (keep in sync with backend app/services/usage.py)
export const MONTHLY_QUOTA = 50
export const OVERAGE_PER_CALL = 0.2
export const CALLS_PER_ANALYSIS = 3
export const BILLING_CYCLE_DAY = 8

const STORAGE_KEY = 'rentcast-usage'

export interface UsageState {
  periodStart: string
  calls: number
}

export type UsageLevel = 'ok' | 'warn' | 'over-soon' | 'over'

export function currentPeriodStart(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  let start: Date
  if (now.getDate() >= BILLING_CYCLE_DAY) {
    start = new Date(y, m, BILLING_CYCLE_DAY)
  } else {
    start = new Date(y, m - 1, BILLING_CYCLE_DAY) // JS Date handles January rollover
  }
  const mm = String(start.getMonth() + 1).padStart(2, '0')
  const dd = String(start.getDate()).padStart(2, '0')
  return `${start.getFullYear()}-${mm}-${dd}`
}

export function loadUsage(): UsageState {
  const period = currentPeriodStart()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as UsageState
      if (parsed.periodStart === period && typeof parsed.calls === 'number') {
        return parsed
      }
    }
  } catch {
    // corrupted storage — start fresh
  }
  return { periodStart: period, calls: 0 }
}

function save(state: UsageState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function recordCalls(n: number): UsageState {
  const state = loadUsage()
  const next = { ...state, calls: state.calls + n }
  save(next)
  return next
}

/** Reconcile with another tally (e.g. the backend's) by taking the max. */
export function reconcile(otherCalls: number): UsageState {
  const state = loadUsage()
  const next = { ...state, calls: Math.max(state.calls, otherCalls) }
  save(next)
  return next
}

export function usageLevel(calls: number): UsageLevel {
  if (calls >= MONTHLY_QUOTA) return 'over'
  if (MONTHLY_QUOTA - calls < CALLS_PER_ANALYSIS) return 'over-soon'
  if (calls >= MONTHLY_QUOTA * 0.8) return 'warn'
  return 'ok'
}

/** Overage cost in dollars for the NEXT analysis, given calls used so far. */
export function nextAnalysisOverageCost(calls: number): number {
  const overageCalls = Math.max(
    0,
    Math.min(CALLS_PER_ANALYSIS, calls + CALLS_PER_ANALYSIS - MONTHLY_QUOTA),
  )
  return overageCalls * OVERAGE_PER_CALL
}
