"""Single-user access gate.

When APP_PASSWORD is set, every protected route requires the X-App-Key
header to match (timing-safe). When unset (local dev, mock stack, tests)
the app is open. /health stays public for Render health checks.

Implemented as a router dependency rather than middleware so 401 responses
pass through CORSMiddleware and the browser can actually read the status.
"""

import hmac

from fastapi import Header, HTTPException

from app import config


async def require_app_password(x_app_key: str = Header(default="")) -> None:
    if not config.APP_PASSWORD:
        return
    if not hmac.compare_digest(x_app_key, config.APP_PASSWORD):
        raise HTTPException(status_code=401, detail="app password required")
