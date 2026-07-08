// Background sync with the backend's /analyses endpoints (Supabase-backed
// when configured). Every call is fire-and-forget from the UI's perspective:
// failures and "not configured" both leave the app fully functional locally.
import { API_URL } from './api'
import type { SavedAnalysis } from './db'

interface RemoteRecord {
  id: string
  address: string
  savedAt: string
  updatedAt: string
  payload: {
    result: SavedAnalysis['result']
    overrides: SavedAnalysis['overrides']
    settings: SavedAnalysis['settings']
    summary: SavedAnalysis['summary']
  }
}

function toRemote(record: SavedAnalysis): RemoteRecord {
  const { id, address, savedAt, updatedAt, ...payload } = record
  return { id, address, savedAt, updatedAt, payload }
}

function fromRemote(remote: RemoteRecord): SavedAnalysis {
  return {
    id: remote.id,
    address: remote.address,
    savedAt: remote.savedAt,
    updatedAt: remote.updatedAt,
    ...remote.payload,
  }
}

/** Pull all remote records. Returns [] when sync is unconfigured or down. */
export async function pullRemote(): Promise<SavedAnalysis[]> {
  try {
    const res = await fetch(`${API_URL}/analyses`)
    if (!res.ok) return []
    const body = await res.json()
    if (!body.configured || !Array.isArray(body.records)) return []
    return body.records.map(fromRemote)
  } catch {
    return []
  }
}

export async function pushRecord(record: SavedAnalysis): Promise<void> {
  try {
    await fetch(`${API_URL}/analyses/${record.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toRemote(record)),
    })
  } catch {
    // local-first: sync failures are silent
  }
}

export async function pushDelete(id: string): Promise<void> {
  try {
    await fetch(`${API_URL}/analyses/${id}`, { method: 'DELETE' })
  } catch {
    // local-first: sync failures are silent
  }
}
