"""Saved-analyses sync endpoints backed by Supabase (optional).

Local-first design: the browser's IndexedDB is the primary store. These
endpoints exist for cross-device sync and always respond 200 — when Supabase
isn't configured they report configured=false and the frontend just stays
local-only.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services import supabase_store as store

router = APIRouter()


class AnalysisRecord(BaseModel):
    id: str = Field(min_length=8, max_length=64)
    address: str
    savedAt: str
    updatedAt: str
    payload: dict


def _to_row(record: AnalysisRecord) -> dict:
    return {
        "id": record.id,
        "address": record.address,
        "saved_at": record.savedAt,
        "updated_at": record.updatedAt,
        "payload": record.payload,
    }


def _from_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "address": row["address"],
        "savedAt": row["saved_at"],
        "updatedAt": row["updated_at"],
        "payload": row["payload"],
    }


@router.get("/analyses")
async def list_analyses() -> dict:
    if not store.configured():
        return {"configured": False, "records": []}
    try:
        rows = await store.list_analyses()
        return {"configured": True, "records": [_from_row(r) for r in rows]}
    except store.SupabaseError as exc:
        return {"configured": True, "error": str(exc), "records": []}


@router.put("/analyses/{analysis_id}")
async def upsert_analysis(analysis_id: str, record: AnalysisRecord) -> dict:
    if record.id != analysis_id:
        return {"synced": False, "error": "id mismatch"}
    if not store.configured():
        return {"configured": False, "synced": False}
    try:
        await store.upsert_analysis(_to_row(record))
        return {"configured": True, "synced": True}
    except store.SupabaseError as exc:
        return {"configured": True, "synced": False, "error": str(exc)}


@router.delete("/analyses/{analysis_id}")
async def delete_analysis(analysis_id: str) -> dict:
    if not store.configured():
        return {"configured": False, "synced": False}
    try:
        await store.delete_analysis(analysis_id)
        return {"configured": True, "synced": True}
    except store.SupabaseError as exc:
        return {"configured": True, "synced": False, "error": str(exc)}
