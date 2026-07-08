export function fmtCurrency(n: number | null | undefined, maxDigits = 0): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: maxDigits,
  })
}

export function fmtPercent(n: number | null | undefined, digits = 2): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
