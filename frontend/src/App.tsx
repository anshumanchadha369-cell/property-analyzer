import { useEffect, useState } from 'react'

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type HealthState =
  | { status: 'checking' }
  | { status: 'connected'; service: string; version: string }
  | { status: 'error'; message: string }

export default function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'checking' })

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`Backend responded with ${res.status}`)
        return res.json()
      })
      .then((data) =>
        setHealth({
          status: 'connected',
          service: data.service,
          version: data.version,
        }),
      )
      .catch((err: Error) => setHealth({ status: 'error', message: err.message }))
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-lg">
        <h1 className="text-2xl font-semibold">Property Analyzer</h1>
        <p className="mt-1 text-sm text-slate-400">
          Phase 0 — infrastructure check
        </p>
        <div className="mt-6 rounded-lg bg-slate-800/60 p-4 text-sm">
          {health.status === 'checking' && (
            <p className="text-slate-300">Checking backend…</p>
          )}
          {health.status === 'connected' && (
            <p className="text-emerald-400">
              ● Backend connected — {health.service} v{health.version}
            </p>
          )}
          {health.status === 'error' && (
            <p className="text-red-400">● Backend unreachable: {health.message}</p>
          )}
        </div>
      </div>
    </main>
  )
}
