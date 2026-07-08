import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config  # noqa: F401  (loads .env before reading os.environ)
from app.routers import analyses, analyze

app = FastAPI(title="Property Analyzer API", version="0.2.0")

# Comma-separated origins; defaults cover local dev. Set ALLOWED_ORIGINS on
# Render to include the deployed Vercel URL.
allowed_origins = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(analyze.router)
app.include_router(analyses.router)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "property-analyzer-api",
        "version": app.version,
    }
