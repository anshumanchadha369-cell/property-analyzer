import os
from pathlib import Path

from dotenv import load_dotenv

# Loads backend/.env regardless of the process working directory. On Render
# the variables are set in the environment and this is a no-op.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

RENTCAST_API_KEY = os.environ.get("RENTCAST_API_KEY", "")
RENTCAST_BASE_URL = os.environ.get("RENTCAST_BASE_URL", "https://api.rentcast.io/v1")

# Optional cross-device sync. When unset, the app is local-only and the
# /analyses endpoints report configured=false.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# Supplemental data sources (Phase 4). Free official APIs; each degrades to
# not_configured / error independently without breaking the analysis.
HUD_API_TOKEN = os.environ.get("HUD_API_TOKEN", "")  # huduser.gov — free token
HUD_BASE_URL = os.environ.get("HUD_BASE_URL", "https://www.huduser.gov/hudapi/public")
CENSUS_API_KEY = os.environ.get("CENSUS_API_KEY", "")  # api.census.gov — free key
CENSUS_BASE_URL = os.environ.get("CENSUS_BASE_URL", "https://api.census.gov")
FEMA_NFHL_BASE_URL = os.environ.get(
    "FEMA_NFHL_BASE_URL",
    "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer",
)  # no key required

# Extra host allowed for /parse-url (mock-mode E2E only, e.g. "localhost").
PARSE_URL_EXTRA_HOST = os.environ.get("PARSE_URL_EXTRA_HOST", "")
