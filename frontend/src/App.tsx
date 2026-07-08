import { useEffect, useState } from 'react'
import AddressForm from './components/AddressForm'
import AnalysisView, { type SavePayload } from './components/AnalysisView'
import ComparisonView from './components/ComparisonView'
import SavedList from './components/SavedList'
import UsageBadge from './components/UsageBadge'
import { analyzeAddress, fetchUsage, parseListingUrl } from './lib/api'
import { EMPTY_OVERRIDES, type DealSettings, type Overrides } from './lib/deal-math'
import {
  deleteSaved,
  listSaved,
  mergeRemote,
  newId,
  putSaved,
  type SavedAnalysis,
} from './lib/db'
import { pullRemote, pushDelete, pushRecord } from './lib/sync'
import { currentTheme, setTheme, type Theme } from './lib/theme'
import { CALLS_PER_ANALYSIS } from './lib/usage'
import { loadUsage, recordCalls, reconcile, type UsageState } from './lib/usage'
import { computeDeployment, computeOperating, deriveBase } from './lib/deal-math'
import type { AnalysisResult } from './types/analysis'

type AnalyzeState =
  | { status: 'idle' }
  | { status: 'loading'; address: string }
  | {
      status: 'done'
      result: AnalysisResult
      savedId: string | null
      initial?: { overrides?: Overrides; settings?: DealSettings }
    }
  | { status: 'error'; message: string }

type Tab = 'analyze' | 'saved'

export default function App() {
  const [state, setState] = useState<AnalyzeState>({ status: 'idle' })
  const [tab, setTab] = useState<Tab>('analyze')
  const [saved, setSaved] = useState<SavedAnalysis[]>([])
  const [comparing, setComparing] = useState<SavedAnalysis[] | null>(null)
  const [usage, setUsage] = useState<UsageState>(() => loadUsage())
  const [mockMode, setMockMode] = useState(false)
  const [theme, setThemeState] = useState<Theme>(() => currentTheme())

  async function refreshSaved() {
    setSaved(await listSaved())
  }

  useEffect(() => {
    refreshSaved()
    // Server tally is best-effort (resets on restart); take the max.
    fetchUsage().then((server) => {
      if (server) {
        setUsage(reconcile(server.callsThisPeriod))
        setMockMode(server.mockMode ?? false)
      }
    })
    // Pull remote saves (no-op until Supabase sync is configured).
    pullRemote().then(async (records) => {
      if (records.length && (await mergeRemote(records)) > 0) refreshSaved()
    })
  }, [])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  async function performAnalysis(address: string): Promise<AnalysisResult> {
    const result = await analyzeAddress(address)
    const calls = result.meta.usage?.callsThisRequest ?? 0
    if (calls > 0) setUsage(recordCalls(calls))
    setMockMode(result.meta.usage?.mockMode ?? false)
    return result
  }

  async function run(input: string) {
    const isUrl = /^https?:\/\//i.test(input)
    setState({ status: 'loading', address: isUrl ? 'the listing page' : input })
    try {
      let address = input
      let priceHint: number | null = null
      if (isUrl) {
        const parsed = await parseListingUrl(input)
        if (!parsed.address) {
          throw new Error(
            'Could not extract an address from that listing page — enter the address manually.',
          )
        }
        address = parsed.address
        priceHint = parsed.listingPrice
        setState({ status: 'loading', address })
      }
      const result = await performAnalysis(address)
      setState({
        status: 'done',
        result,
        savedId: null,
        initial: priceHint ? { overrides: { ...EMPTY_OVERRIDES, price: priceHint } } : undefined,
      })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleSave(payload: SavePayload) {
    if (state.status !== 'done') return
    const now = new Date().toISOString()
    const existing = state.savedId ? saved.find((r) => r.id === state.savedId) : undefined
    const record: SavedAnalysis = {
      id: state.savedId ?? newId(),
      address: payload.address,
      savedAt: existing?.savedAt ?? now,
      updatedAt: now,
      result: state.result,
      overrides: payload.overrides,
      settings: payload.settings,
      summary: payload.summary,
    }
    await putSaved(record)
    pushRecord(record) // fire-and-forget sync
    await refreshSaved()
    setState({ ...state, savedId: record.id })
  }

  function handleLoad(record: SavedAnalysis) {
    setState({
      status: 'done',
      result: record.result,
      savedId: record.id,
      initial: { overrides: record.overrides, settings: record.settings },
    })
    setTab('analyze')
  }

  async function handleDelete(record: SavedAnalysis) {
    if (!window.confirm(`Delete the saved analysis for ${record.address}?`)) return
    await deleteSaved(record.id)
    pushDelete(record.id)
    await refreshSaved()
    if (state.status === 'done' && state.savedId === record.id) {
      setState({ ...state, savedId: null })
    }
  }

  async function handleRefetch(record: SavedAnalysis) {
    const ok = window.confirm(
      `Re-fetching ${record.address} uses ${CALLS_PER_ANALYSIS} API calls. Continue?`,
    )
    if (!ok) return
    setTab('analyze')
    setState({ status: 'loading', address: record.address })
    try {
      const result = await performAnalysis(record.result.meta.address)
      const base = deriveBase(result, record.overrides)
      const operating = computeOperating(base, record.settings)
      const deployment =
        operating && base.price ? computeDeployment(base.price, operating, record.settings) : null
      const updated: SavedAnalysis = {
        ...record,
        updatedAt: new Date().toISOString(),
        result,
        summary: {
          unitCount: base.unitCount,
          price: base.price,
          capRate: operating?.capRate ?? null,
          cashOnCash: deployment?.cashOnCash ?? null,
          monthlyCashFlow: deployment?.monthlyCashFlow ?? null,
        },
      }
      await putSaved(updated)
      pushRecord(updated)
      await refreshSaved()
      setState({
        status: 'done',
        result,
        savedId: record.id,
        initial: { overrides: record.overrides, settings: record.settings },
      })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const analysisKey =
    state.status === 'done' ? (state.savedId ?? state.result.meta.fetchedAt) : 'none'

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <header className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">Property Analyzer</h1>
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                Multi-unit investment snapshot from a single address.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-end gap-2">
                <UsageBadge calls={usage.calls} />
                {mockMode ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300"
                    title="The backend is pointed at the local mock RentCast server. No live API calls are made and nothing counts against your quota."
                  >
                    ⚠ MOCK DATA — no API quota used
                  </span>
                ) : null}
              </div>
              <button
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-base leading-6 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {theme === 'dark' ? '☀' : '☾'}
              </button>
            </div>
          </div>
        </header>

        <div className="mb-6 flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {(
            [
              ['analyze', 'Analyze'],
              ['saved', `Saved (${saved.length})`],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'analyze' ? (
          <>
            <AddressForm onSubmit={run} busy={state.status === 'loading'} />
            <div className="mt-8">
              {state.status === 'idle' && (
                <p className="text-sm text-slate-500 dark:text-slate-600">
                  Enter an address to fetch property records, value estimate, and market rent.
                </p>
              )}
              {state.status === 'loading' && (
                <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <p className="animate-pulse text-slate-600 dark:text-slate-300">
                    Analyzing {state.address} — fetching property records, value estimate, rent
                    estimate…
                  </p>
                </div>
              )}
              {state.status === 'error' && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-6 dark:border-red-500/40 dark:bg-red-950/30">
                  <p className="text-red-700 dark:text-red-300">{state.message}</p>
                  <p className="mt-2 text-sm text-red-600/80 dark:text-red-400/70">
                    Check that the backend is running and reachable, then try again.
                  </p>
                </div>
              )}
              {state.status === 'done' && (
                <AnalysisView
                  key={analysisKey}
                  result={state.result}
                  initialOverrides={state.initial?.overrides}
                  initialSettings={state.initial?.settings}
                  saved={state.savedId != null}
                  onSave={handleSave}
                />
              )}
            </div>
          </>
        ) : comparing ? (
          <ComparisonView records={comparing} onBack={() => setComparing(null)} />
        ) : (
          <SavedList
            records={saved}
            busy={state.status === 'loading'}
            onLoad={handleLoad}
            onRefetch={handleRefetch}
            onDelete={handleDelete}
            onCompare={setComparing}
          />
        )}
      </div>
    </main>
  )
}
