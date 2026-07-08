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
