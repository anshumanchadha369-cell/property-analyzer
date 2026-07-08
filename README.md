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

For dev/testing without spending RentCast calls, run the bundled mock and point the backend at it:

```
# terminal 1 — mock RentCast on :9100
cd backend
.venv\Scripts\python -m uvicorn mock_rentcast:app --port 9100

# terminal 2 — backend using the mock
cd backend
$env:RENTCAST_BASE_URL='http://localhost:9100'; $env:RENTCAST_API_KEY='mock-key'
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

## Deployment

- **Backend → Render**: `render.yaml` at repo root defines the service (rootDir `backend`). Set the `ALLOWED_ORIGINS` env var to the deployed frontend URL.
- **Frontend → Vercel**: set the project root to `frontend/`, add `VITE_API_URL` env var pointing at the Render URL.
