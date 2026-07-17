import type { AnalysisResult, UsageInfo } from '../types/analysis'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const APP_KEY_STORAGE = 'app-key'

export function getAppKey(): string | null {
  try {
    return localStorage.getItem(APP_KEY_STORAGE)
  } catch {
    return null
  }
}

export function setAppKey(key: string): void {
  localStorage.setItem(APP_KEY_STORAGE, key)
}

/** Fetch with the app password header; fires `app-unauthorized` on 401. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = getAppKey()
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(key ? { 'X-App-Key': key } : {}) },
  })
  if (res.status === 401) {
    window.dispatchEvent(new Event('app-unauthorized'))
    throw new Error('This app is password-protected — unlock to continue.')
  }
  return res
}

export async function fetchUsage(): Promise<UsageInfo | null> {
  try {
    const res = await apiFetch('/usage')
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export interface ParsedListing {
  host: string
  address: string | null
  listingPrice: number | null
}

export async function parseListingUrl(url: string): Promise<ParsedListing> {
  const res = await apiFetch('/parse-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.detail ?? `Listing parse failed (${res.status})`)
  }
  return body
}

export async function analyzeAddress(address: string): Promise<AnalysisResult> {
  const res = await apiFetch('/analyze', {
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
