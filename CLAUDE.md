# Property Analyzer

Personal web app: quick investment analysis for multi-unit (2-4 unit) properties, WA state first. Single user, no auth. Enter address or Zillow/Redfin/Realtor URL + available cash → sourced data + investment metrics centered on cash-deployment efficiency.

## Architecture

- `backend/` — FastAPI (Python 3.11). API orchestration (`asyncio.gather` with per-source graceful degradation), URL parsers, calculation engine (pure functions, pytest-covered).
- `frontend/` — React + Vite + Tailwind v4 (via `@tailwindcss/vite` plugin, no tailwind.config). Client-side calculator so sensitivity sliders update instantly with no API calls. IndexedDB (Dexie) local-first storage, Supabase background sync.
- Deploy: Render (backend, see `render.yaml`) + Vercel (frontend, project root = `frontend/`). Free tiers; Render free tier cold-starts after idle (~30-50s, accepted for POC).
- Live URLs: frontend https://property-analyzer-nine.vercel.app, backend https://property-analyzer-api.onrender.com. GitHub: anshumanchadha369-cell/property-analyzer (public). Both auto-deploy on push to `main`. Render env var `ALLOWED_ORIGINS` must list the Vercel origin; Vercel env var `VITE_API_URL` points at the Render URL.

## Data sources (all free tier / official)

RentCast is primary (property details, AVM, rent estimates, comps — 50 calls/mo free). Supplements: HUD FMR, Census ACS, FEMA NFHL flood, FRED, BLS, Walk Score, GreatSchools, Nominatim (address autocomplete). Listing-URL parsing is done in-house (JSON-LD / Open Graph extraction, HTML fallback) — no scraper APIs. Prefer official APIs and pay-as-you-go over subscriptions.

## Product rules

- 6% threshold on cap rate and cash-on-cash: red below, green at/above (hardcoded in v1).
- Every data point carries a freshness label (live / monthly / quarterly / annual); stale (>6 months) gets a warning.
- One analysis = one JSON snapshot. Saved analyses reload with zero API calls. Comparison view reads saved data only.
- Metrics: NOI, cap rate, CoC, DSCR, GRM, 1% rule, break-even months, cash-deployment breakdown (down payment, closing, rehab, reserves, undeployed remainder), HYSA opportunity-cost comparison.

## Testing policy — protect the API quota (user directive, 2026-07-08)

NEVER burn live RentCast calls in tests or routine dev verification — the 50-call/month quota is reserved for the user's real analyses. Unit tests mock at the service/transport layer (monkeypatch or httpx.MockTransport). Browser/E2E verification runs against `backend/mock_sources.py` (port 9100; mocks RentCast + HUD + FEMA + Census) with the base-URL env overrides listed in the README. Live RentCast calls happen ONLY with the user's explicit approval, typically a single user-chosen address at a phase boundary. Apply the same fixture-first approach to every future data source.

## Development approach

RentCast usage/cost tracking: no usage API exists, so calls are tallied client-side (localStorage, authoritative per-device) + server-memory (best effort), reconciled by max. Quota facts in `backend/app/services/usage.py`: 50 calls/period, $0.20/call overage (card on file), billing cycle renews the 8th. Each analysis = 3 calls. UI badge warns at 80% and prices the next analysis when it would exceed the free tier.

Known data limitation (found in first live run): RentCast matches plain street addresses to a single record — a multi-unit building listed as "#D1-D6" came back as a Single Family 2/1. Phase 2 must include manual overrides (price, rent, unit count) so listing knowledge can correct AVM mismatches.

Incremental, working-to-working phases — each ends deployed and usable:
0. Infra skeleton (done when: frontend on Vercel talks to backend on Render) — DONE
1. Core analysis with RentCast only — DONE (live-verified 2026-07-08)
2. Cash deployment calculator + manual overrides — DONE (2026-07-08; TS mirror of tested Python math in frontend/src/lib/deal-math.ts, keep in sync with backend/app/calculations/)
3. Persistence — DONE (2026-07-08). Local-first: IndexedDB (Dexie, frontend/src/lib/db.ts) is primary; saved analyses load with ZERO API calls. Supabase sync is optional and goes through backend /analyses endpoints (service key server-side only; endpoints report configured:false until SUPABASE_URL + SUPABASE_SERVICE_KEY are set on Render — table SQL in app/services/supabase_store.py docstring). Records: {id, address, savedAt, updatedAt, result snapshot, overrides, settings, summary}; merge strategy last-write-wins by updatedAt. Re-fetch from saved list costs 3 calls and asks confirm().
2. Cash deployment calculator (client-side)
3. Persistence (IndexedDB + Supabase sync)
4. Additional data APIs, one at a time (HUD → FEMA → Census → FRED/BLS → Walk Score → GreatSchools)
5. Listing-URL parsing (Zillow/Redfin/Realtor, fixture-tested)
6. Comparison view + mobile polish

Calculations are pure functions with pytest coverage from day one. Parsers get fixture-based tests.

## Commands

- Backend tests: `cd backend && .venv\Scripts\python -m pytest`
- Backend dev: `cd backend && .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000`
- Frontend dev: `cd frontend && npm run dev` (port 5173)
- Frontend typecheck + build: `cd frontend && npm run build`
