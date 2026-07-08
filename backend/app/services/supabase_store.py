"""Thin Supabase (PostgREST) client for the analyses table.

The service-role key lives ONLY on the server — the frontend syncs through
our /analyses endpoints and never talks to Supabase directly.

Expected table (run once in the Supabase SQL editor):

    create table analyses (
      id uuid primary key,
      address text not null,
      saved_at timestamptz not null,
      updated_at timestamptz not null,
      payload jsonb not null
    );
"""

import httpx

from app import config

TIMEOUT_SECONDS = 10.0

# Test seam, same pattern as the RentCast client.
_transport: httpx.AsyncBaseTransport | None = None


class SupabaseError(Exception):
    pass


def configured() -> bool:
    return bool(config.SUPABASE_URL and config.SUPABASE_SERVICE_KEY)


def _headers() -> dict:
    key = config.SUPABASE_SERVICE_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


async def _request(method: str, path: str, **kwargs) -> httpx.Response:
    async with httpx.AsyncClient(
        base_url=f"{config.SUPABASE_URL}/rest/v1",
        timeout=TIMEOUT_SECONDS,
        transport=_transport,
    ) as client:
        try:
            resp = await client.request(method, path, headers={**_headers(), **kwargs.pop("headers", {})}, **kwargs)
        except httpx.HTTPError as exc:
            raise SupabaseError(f"Supabase request failed: {exc}") from exc
    if resp.status_code >= 400:
        raise SupabaseError(f"Supabase {method} {path} returned {resp.status_code}: {resp.text[:200]}")
    return resp


async def list_analyses() -> list[dict]:
    resp = await _request("GET", "/analyses", params={"select": "*", "order": "updated_at.desc"})
    return resp.json()


async def upsert_analysis(record: dict) -> None:
    await _request(
        "POST",
        "/analyses",
        json=record,
        headers={"Prefer": "resolution=merge-duplicates"},
    )


async def delete_analysis(analysis_id: str) -> None:
    await _request("DELETE", "/analyses", params={"id": f"eq.{analysis_id}"})
