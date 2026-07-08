// Local-first persistence: IndexedDB via Dexie. This is the primary store —
// saved analyses load instantly with zero API calls. Supabase (through the
// backend) is only a sync layer on top.
import Dexie, { type EntityTable } from 'dexie'
import type { AnalysisResult } from '../types/analysis'
import type { DealSettings, Overrides } from './deal-math'

export interface SavedSummary {
  unitCount: number | null
  price: number | null
  capRate: number | null
  cashOnCash: number | null
  monthlyCashFlow: number | null
}

export interface SavedAnalysis {
  id: string
  address: string
  savedAt: string
  updatedAt: string
  result: AnalysisResult
  overrides: Overrides
  settings: DealSettings
  summary: SavedSummary
}

const db = new Dexie('property-analyzer') as Dexie & {
  analyses: EntityTable<SavedAnalysis, 'id'>
}

db.version(1).stores({
  // Only indexed fields are listed; the full objects are stored as-is.
  analyses: 'id, updatedAt, address',
})

export function newId(): string {
  return crypto.randomUUID()
}

export async function listSaved(): Promise<SavedAnalysis[]> {
  return db.analyses.orderBy('updatedAt').reverse().toArray()
}

export async function putSaved(record: SavedAnalysis): Promise<void> {
  await db.analyses.put(record)
}

export async function deleteSaved(id: string): Promise<void> {
  await db.analyses.delete(id)
}

/** Merge remote records into the local store; newest updatedAt wins. */
export async function mergeRemote(records: SavedAnalysis[]): Promise<number> {
  let merged = 0
  for (const remote of records) {
    const local = await db.analyses.get(remote.id)
    if (!local || remote.updatedAt > local.updatedAt) {
      await db.analyses.put(remote)
      merged += 1
    }
  }
  return merged
}
