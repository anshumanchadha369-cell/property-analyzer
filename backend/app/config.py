import os
from pathlib import Path

from dotenv import load_dotenv

# Loads backend/.env regardless of the process working directory. On Render
# the variables are set in the environment and this is a no-op.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

RENTCAST_API_KEY = os.environ.get("RENTCAST_API_KEY", "")
RENTCAST_BASE_URL = os.environ.get("RENTCAST_BASE_URL", "https://api.rentcast.io/v1")
