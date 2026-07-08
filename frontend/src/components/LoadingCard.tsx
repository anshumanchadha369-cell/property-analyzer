import { useEffect, useState } from 'react'

const STAGES = [
  'Fetching property records…',
  'Pulling value & rent estimates…',
  'Checking market context — HUD fair market rents, flood zone, demographics…',
  'Crunching the numbers…',
]

const STAGE_MS = 900

export default function LoadingCard({ address }: { address: string }) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      STAGE_MS,
    )
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <p className="font-medium text-slate-700 dark:text-slate-200">Analyzing {address}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {STAGES.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2 transition-opacity ${
              i > stage ? 'opacity-30' : ''
            }`}
          >
            {i < stage ? (
              <span className="text-emerald-600 dark:text-emerald-400">✓</span>
            ) : i === stage ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            ) : (
              <span className="inline-block h-3 w-3 rounded-full border border-slate-300 dark:border-slate-700" />
            )}
            <span
              className={
                i === stage
                  ? 'animate-pulse text-slate-700 dark:text-slate-200'
                  : 'text-slate-500'
              }
            >
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
