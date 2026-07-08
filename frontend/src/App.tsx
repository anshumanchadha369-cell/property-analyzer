import { useEffect, useState } from 'react'
import AddressForm from './components/AddressForm'
import AnalysisView from './components/AnalysisView'
import UsageBadge from './components/UsageBadge'
import { analyzeAddress, fetchUsage } from './lib/api'
import { loadUsage, recordCalls, reconcile, type UsageState } from './lib/usage'
import type { AnalysisResult } from './types/analysis'

type ViewState =
  | { status: 'idle' }
  | { status: 'loading'; address: string }
  | { status: 'done'; result: AnalysisResult }
  | { status: 'error'; message: string }

export default function App() {
  const [state, setState] = useState<ViewState>({ status: 'idle' })
  const [usage, setUsage] = useState<UsageState>(() => loadUsage())
  const [mockMode, setMockMode] = useState(false)

  useEffect(() => {
    // Server tally is best-effort (resets on restart); take the max.
    fetchUsage().then((server) => {
      if (server) {
        setUsage(reconcile(server.callsThisPeriod))
        setMockMode(server.mockMode ?? false)
      }
    })
  }, [])

  async function run(address: string) {
    setState({ status: 'loading', address })
    try {
      const result = await analyzeAddress(address)
      const calls = result.meta.usage?.callsThisRequest ?? 0
      if (calls > 0) setUsage(recordCalls(calls))
      setMockMode(result.meta.usage?.mockMode ?? false)
      setState({ status: 'done', result })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <header className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">Property Analyzer</h1>
              <p className="mt-1 text-slate-400">
                Multi-unit investment snapshot from a single address.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <UsageBadge calls={usage.calls} />
              {mockMode ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-300"
                  title="The backend is pointed at the local mock RentCast server. No live API calls are made and nothing counts against your quota."
                >
                  ⚠ MOCK DATA — no API quota used
                </span>
              ) : null}
            </div>
          </div>
        </header>

        <AddressForm onSubmit={run} busy={state.status === 'loading'} />

        <div className="mt-8">
          {state.status === 'idle' && (
            <p className="text-sm text-slate-600">
              Enter an address to fetch property records, value estimate, and market rent.
            </p>
          )}
          {state.status === 'loading' && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <p className="animate-pulse text-slate-300">
                Analyzing {state.address} — fetching property records, value estimate, rent
                estimate…
              </p>
            </div>
          )}
          {state.status === 'error' && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-6">
              <p className="text-red-300">{state.message}</p>
              <p className="mt-2 text-sm text-red-400/70">
                Check that the backend is running and reachable, then try again.
              </p>
            </div>
          )}
          {state.status === 'done' && <AnalysisView result={state.result} />}
        </div>
      </div>
    </main>
  )
}
