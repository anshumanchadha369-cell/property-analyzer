import { computeDeployment, computeOperating, deriveBase } from '../lib/deal-math'
import type { SavedAnalysis } from '../lib/db'
import { fmtCurrency, fmtNumber, fmtPercent } from '../lib/format'

const RETURN_THRESHOLD = 0.06

type Tone = 'good' | 'warn' | 'bad' | undefined

interface Cell {
  text: string
  tone?: Tone
}

interface Row {
  label: string
  cells: Cell[]
}

function toneClass(tone: Tone): string {
  if (tone === 'good') return 'text-emerald-600 dark:text-emerald-400'
  if (tone === 'bad') return 'text-red-600 dark:text-red-400'
  if (tone === 'warn') return 'text-amber-600 dark:text-amber-400'
  return 'text-slate-700 dark:text-slate-200'
}

export default function ComparisonView({
  records,
  onBack,
}: {
  records: SavedAnalysis[]
  onBack: () => void
}) {
  const computed = records.map((rec) => {
    const base = deriveBase(rec.result, rec.overrides)
    const operating = computeOperating(base, rec.settings)
    const deployment =
      operating && base.price ? computeDeployment(base.price, operating, rec.settings) : null
    return { rec, base, operating, deployment }
  })

  const flagPct = (v: number | null | undefined): Cell => ({
    text: fmtPercent(v ?? null),
    tone: v == null ? undefined : v >= RETURN_THRESHOLD ? 'good' : 'bad',
  })

  const rows: Row[] = [
    {
      label: 'Price',
      cells: computed.map(({ base }) => ({ text: fmtCurrency(base.price) })),
    },
    {
      label: 'Units',
      cells: computed.map(({ base }) => ({ text: fmtNumber(base.unitCount) })),
    },
    {
      label: 'Price / unit',
      cells: computed.map(({ operating }) => ({ text: fmtCurrency(operating?.pricePerUnit) })),
    },
    {
      label: 'Rent / mo',
      cells: computed.map(({ base }) => ({ text: fmtCurrency(base.monthlyRent) })),
    },
    {
      label: 'NOI / yr',
      cells: computed.map(({ operating }) => ({ text: fmtCurrency(operating?.noi) })),
    },
    {
      label: 'Cap rate',
      cells: computed.map(({ operating }) => flagPct(operating?.capRate)),
    },
    {
      label: 'Cash-on-cash',
      cells: computed.map(({ deployment }) => flagPct(deployment?.cashOnCash)),
    },
    {
      label: 'DSCR',
      cells: computed.map(({ deployment }) => {
        const d = deployment?.dscr
        return {
          text: d == null ? '—' : d.toFixed(2),
          tone: d == null ? undefined : d >= 1.25 ? 'good' : d >= 1.0 ? 'warn' : 'bad',
        } as Cell
      }),
    },
    {
      label: 'Cash flow / mo',
      cells: computed.map(({ deployment }) => {
        const cf = deployment?.monthlyCashFlow
        return {
          text: cf == null ? '—' : fmtCurrency(cf),
          tone: cf == null ? undefined : cf > 0 ? 'good' : 'bad',
        } as Cell
      }),
    },
    {
      label: 'Break-even',
      cells: computed.map(({ deployment }) => {
        const be = deployment?.breakEvenMonths
        return {
          text: be == null ? 'Never' : be < 12 ? `${Math.round(be)} mo` : `${(be / 12).toFixed(1)} yr`,
          tone: be == null ? 'bad' : undefined,
        } as Cell
      }),
    },
    {
      label: '1% rule',
      cells: computed.map(({ operating }) => {
        const p = operating?.onePercentRule.passes
        return {
          text: p == null ? '—' : p ? 'Pass' : 'Fail',
          tone: p == null ? undefined : p ? 'good' : 'bad',
        } as Cell
      }),
    },
    {
      label: 'Cash required',
      cells: computed.map(({ deployment }) => ({ text: fmtCurrency(deployment?.totalRequired) })),
    },
    {
      label: 'Undeployed',
      cells: computed.map(({ deployment }) => {
        const u = deployment?.undeployed
        return {
          text: u == null ? '—' : fmtCurrency(u),
          tone: u == null ? undefined : u < 0 ? 'bad' : u < 5000 ? 'warn' : 'good',
        } as Cell
      }),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Comparing {records.length} properties
        </h2>
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ← Back to saved
        </button>
      </div>

      {/* Wide table scrolls inside its own container on narrow screens */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Metric
              </th>
              {computed.map(({ rec }) => (
                <th
                  key={rec.id}
                  className="max-w-48 p-3 text-left align-bottom font-medium text-slate-900 dark:text-slate-100"
                >
                  <span className="line-clamp-2">{rec.address}</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    {rec.summary.unitCount ? `${rec.summary.unitCount} units` : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="p-3 text-xs text-slate-500">{row.label}</td>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={`p-3 font-medium tabular-nums ${toneClass(cell.tone)}`}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Computed from each property's saved data and assumptions — no API calls. Green/red follow
        the 6% threshold; DSCR bands at 1.25 / 1.0.
      </p>
    </div>
  )
}
