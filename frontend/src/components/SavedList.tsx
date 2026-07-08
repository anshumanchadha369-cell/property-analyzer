import { useState } from 'react'
import type { SavedAnalysis } from '../lib/db'
import { fmtCurrency, fmtDate, fmtPercent } from '../lib/format'

const RETURN_THRESHOLD = 0.06

function ReturnStat({ label, value }: { label: string; value: number | null }) {
  const color =
    value == null
      ? 'text-slate-500'
      : value >= RETURN_THRESHOLD
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400'
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>{fmtPercent(value)}</p>
    </div>
  )
}

export default function SavedList({
  records,
  busy,
  onLoad,
  onRefetch,
  onDelete,
  onCompare,
}: {
  records: SavedAnalysis[]
  busy: boolean
  onLoad: (record: SavedAnalysis) => void
  onRefetch: (record: SavedAnalysis) => void
  onDelete: (record: SavedAnalysis) => void
  onCompare: (records: SavedAnalysis[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-500 dark:text-slate-400">No saved analyses yet.</p>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-600">
          Run an analysis and hit Save — loading it later costs zero API calls.
        </p>
      </div>
    )
  }

  const selectedRecords = records.filter((r) => selected.has(r.id))

  return (
    <div className="space-y-3">
      {records.length >= 2 ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500">
            {selected.size < 2
              ? 'Select 2+ properties to compare side by side'
              : `${selected.size} selected`}
          </p>
          <button
            onClick={() => onCompare(selectedRecords)}
            disabled={selected.size < 2}
            className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Compare ({selected.size})
          </button>
        </div>
      ) : null}
      {records.map((rec) => (
        <div
          key={rec.id}
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex sm:items-center sm:gap-6"
        >
          {records.length >= 2 ? (
            <input
              type="checkbox"
              checked={selected.has(rec.id)}
              onChange={() => toggle(rec.id)}
              aria-label={`Select ${rec.address} for comparison`}
              className="mb-2 h-4 w-4 accent-sky-600 sm:mb-0"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-900 dark:text-slate-100">{rec.address}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              saved {fmtDate(rec.updatedAt)}
              {rec.summary.unitCount ? ` · ${rec.summary.unitCount} units` : ''}
              {rec.summary.monthlyCashFlow != null
                ? ` · ${fmtCurrency(rec.summary.monthlyCashFlow)}/mo cash flow`
                : ''}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-4 sm:mt-0 sm:w-72">
            <div>
              <p className="text-xs text-slate-500">Price</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {fmtCurrency(rec.summary.price)}
              </p>
            </div>
            <ReturnStat label="Cap rate" value={rec.summary.capRate} />
            <ReturnStat label="CoC" value={rec.summary.cashOnCash} />
          </div>
          <div className="mt-3 flex gap-2 sm:mt-0">
            <button
              onClick={() => onLoad(rec)}
              disabled={busy}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
              title="Open this saved analysis — no API calls"
            >
              Load
            </button>
            <button
              onClick={() => onRefetch(rec)}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Fetch fresh data for this address (uses 3 API calls)"
            >
              Re-fetch
            </button>
            <button
              onClick={() => onDelete(rec)}
              disabled={busy}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
