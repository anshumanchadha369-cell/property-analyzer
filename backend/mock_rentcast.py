"""Local mock of the RentCast API — dev/testing without burning API quota.

Testing policy: never hit live RentCast in tests or routine dev verification.
Run this on :9100 and point the backend at it via RENTCAST_BASE_URL.

    # terminal 1
    .venv\\Scripts\\python -m uvicorn mock_rentcast:app --port 9100

    # terminal 2
    $env:RENTCAST_BASE_URL='http://localhost:9100'; $env:RENTCAST_API_KEY='mock-key'
    .venv\\Scripts\\python -m uvicorn app.main:app --reload --port 8000

Fixture: a realistic Tacoma fourplex (cap rate lands ~5.2%, below the 6%
threshold, so red-flag styling is exercised).
"""

from fastapi import FastAPI

app = FastAPI(title="Mock RentCast")

PROPERTY = {
    "formattedAddress": "1234 S Ainsworth Ave, Tacoma, WA 98405",
    "propertyType": "Multi-Family",
    "bedrooms": 8,
    "bathrooms": 4,
    "squareFootage": 3840,
    "lotSize": 7200,
    "yearBuilt": 1962,
    "features": {"unitCount": 4},
    "propertyTaxes": {"2024": {"total": 6520}, "2025": {"total": 6800}},
    "lastSalePrice": 615000,
    "lastSaleDate": "2019-08-14T00:00:00.000Z",
    "county": "Pierce",
    "latitude": 47.2412,
    "longitude": -122.4443,
}

VALUE = {
    "price": 780000,
    "priceRangeLow": 745000,
    "priceRangeHigh": 815000,
    "comparables": [
        {
            "formattedAddress": f"{1300 + i * 12} S {'Ainsworth' if i % 2 else 'Cushman'} Ave, Tacoma, WA",
            "price": 760000 + i * 9000,
            "correlation": round(0.97 - i * 0.02, 2),
            "distance": round(0.2 + i * 0.15, 2),
            "squareFootage": 3700 + i * 80,
            "bedrooms": 8,
        }
        for i in range(7)
    ],
}

RENT = {
    "rent": 5600,
    "rentRangeLow": 5200,
    "rentRangeHigh": 6000,
    "comparables": [
        {
            "formattedAddress": f"{800 + i * 31} S {'J' if i % 2 else 'M'} St, Tacoma, WA",
            "price": 1350 + i * 40,
            "correlation": round(0.95 - i * 0.03, 2),
            "distance": round(0.3 + i * 0.2, 2),
            "squareFootage": 950 + i * 25,
            "bedrooms": 2,
        }
        for i in range(6)
    ],
}


@app.get("/properties")
def properties(address: str):
    return [PROPERTY]


@app.get("/avm/value")
def value(address: str):
    return VALUE


@app.get("/avm/rent/long-term")
def rent(address: str):
    return RENT
