// Shared presentational primitives for dashboard cards and metric tiles.
import { fmtCurrency } from '../lib/format'

export function Card({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm text-slate-200">{value}</p>
    </div>
  )
}

export type TileFlag = 'good' | 'warn' | 'bad'

export function MetricTile({
  label,
  value,
  flag,
  sub,
}: {
  label: string
  value: string
  flag?: TileFlag
  sub?: string
}) {
  const valueColor =
    flag === 'good'
      ? 'text-emerald-400'
      : flag === 'bad'
        ? 'text-red-400'
        : flag === 'warn'
          ? 'text-amber-400'
          : 'text-slate-100'
  const border =
    flag === 'good'
      ? 'border-emerald-500/30'
      : flag === 'bad'
        ? 'border-red-500/30'
        : flag === 'warn'
          ? 'border-amber-500/30'
          : 'border-slate-800'
  return (
    <div className={`rounded-lg border ${border} bg-slate-950/60 p-4`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueColor}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  )
}

export function MoneyRow({
  label,
  amount,
  estimated,
  strong,
  negative,
}: {
  label: string
  amount: number
  estimated?: boolean
  strong?: boolean
  negative?: boolean
}) {
  return (
    <div
      className={`flex justify-between py-1.5 ${strong ? 'font-semibold text-slate-100' : 'text-slate-300'}`}
    >
      <span>
        {label}
        {estimated ? <span className="ml-1.5 text-xs text-amber-400/80">(est.)</span> : null}
      </span>
      <span className={`tabular-nums ${negative ? 'text-red-400' : ''}`}>
        {fmtCurrency(amount)}
      </span>
    </div>
  )
}
