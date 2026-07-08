# Property Analyzer

Personal web app: quick investment analysis for multi-unit (2-4 unit) properties, WA state first. Single user, no auth. Enter address or Zillow/Redfin/Realtor URL + available cash → sourced data + investment metrics centered on cash-deployment efficiency.

## Architecture

- `backend/` — FastAPI (Python 3.11). API orchestration (`asyncio.gather` with per-source graceful degradation), URL parsers, calculation engine (pure functions, pytest-covered).
- `frontend/` — React + Vite + Tailwind v4 (via `@tailwindcss/vite` plugin, no tailwind.config). Client-side calculator so sensitivity sliders update instantly with no API calls. IndexedDB (Dexie) local-first storage, Supabase background sync.
- Deploy: Render (backend, see `render.yaml`) + Vercel (frontend, project root = `frontend/`). Free tiers; Render free tier cold-starts after idle (~30-50s, accepted for POC).

## Data sources (all free tier / official)

RentCast is primary (property details, AVM, rent estimates, comps — 50 calls/mo free). Supplements: HUD FMR, Census ACS, FEMA NFHL flood, FRED, BLS, Walk Score, GreatSchools, Nominatim (address autocomplete). Listing-URL parsing is done in-house (JSON-LD / Open Graph extraction, HTML fallback) — no scraper APIs. Prefer official APIs and pay-as-you-go over subscriptions.

## Product rules

- 6% threshold on cap rate and cash-on-cash: red below, green at/above (hardcoded in v1).
- Every data point carries a freshness label (live / monthly / quarterly / annual); stale (>6 months) gets a warning.
- One analysis = one JSON snapshot. Saved analyses reload with zero API calls. Comparison view reads saved data only.
- Metrics: NOI, cap rate, CoC, DSCR, GRM, 1% rule, break-even months, cash-deployment breakdown (down payment, closing, rehab, reserves, undeployed remainder), HYSA opportunity-cost comparison.

## Development approach

Incremental, working-to-working phases — each ends deployed and usable:
0. Infra skeleton (done when: frontend on Vercel talks to backend on Render)
1. Core analysis with RentCast only
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
