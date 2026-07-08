# Property Analyzer

Personal web app for quick investment analysis of multi-unit properties. Enter an address (or paste a Zillow/Redfin listing URL) plus your available cash, and get sourced data — pricing, market rent, cap rate, cash-on-cash — centered on whether the deal is a good use of that cash.

## Stack

- **Backend**: FastAPI (Python) on Render — API orchestration, URL parsing, calculation engine
- **Frontend**: React + Vite + Tailwind on Vercel — responsive UI, client-side sensitivity calculator
- **Storage**: IndexedDB local-first, Supabase for cross-device sync
- **Data**: RentCast + free official APIs (HUD FMR, Census, FEMA, FRED, BLS, Walk Score, GreatSchools)

## Local development

### Backend (http://localhost:8000)

```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run tests:

```
cd backend
.venv\Scripts\python -m pytest
```

### Frontend (http://localhost:5173)

```
cd frontend
npm install
npm run dev
```

The frontend reads `VITE_API_URL` (defaults to `http://localhost:8000`).

### Mock mode (no API quota usage)

For dev/testing without spending any live API calls, run the bundled mock (all sources: RentCast, HUD, FEMA, Census) and point the backend at it:

```
# terminal 1 — mock sources on :9100
cd backend
.venv\Scripts\python -m uvicorn mock_sources:app --port 9100

# terminal 2 — backend using the mocks
cd backend
$env:RENTCAST_BASE_URL='http://localhost:9100'
$env:RENTCAST_API_KEY='mock-key'
$env:HUD_BASE_URL='http://localhost:9100/hudapi/public'
$env:HUD_API_TOKEN='mock-token'
$env:CENSUS_BASE_URL='http://localhost:9100'
$env:CENSUS_API_KEY='mock-key'
$env:FEMA_NFHL_BASE_URL='http://localhost:9100/arcgis/rest/services/public/NFHL/MapServer'
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

### Data source keys

RentCast is required; the rest are optional and the app degrades gracefully without them (sections show "requires API key"). All free:

| Source | Env var | Signup |
|---|---|---|
| RentCast (property/value/rent) | `RENTCAST_API_KEY` | https://app.rentcast.io/app/api |
| HUD Fair Market Rents | `HUD_API_TOKEN` | https://www.huduser.gov/portal/dataset/fmr-api.html |
| Census ACS demographics | `CENSUS_API_KEY` | https://api.census.gov/data/key_signup.html |
| FEMA flood zones | — (no key) | — |

## Deployment

- **Backend → Render**: `render.yaml` at repo root defines the service (rootDir `backend`). Set the `ALLOWED_ORIGINS` env var to the deployed frontend URL.
- **Frontend → Vercel**: set the project root to `frontend/`, add `VITE_API_URL` env var pointing at the Render URL.
