import type { AnalysisResult, UsageInfo } from '../types/analysis'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function fetchUsage(): Promise<UsageInfo | null> {
  try {
    const res = await fetch(`${API_URL}/usage`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function analyzeAddress(address: string): Promise<AnalysisResult> {
  const res = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Analysis failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}
