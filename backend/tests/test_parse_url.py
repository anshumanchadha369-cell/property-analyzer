import httpx
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.services import url_parser

client = TestClient(app)

ZILLOW_STYLE_HTML = """
<!doctype html><html><head>
<meta property="og:title" content="1613 Maple Ln, Kent, WA 98030 | MLS #2299999 | Zillow" />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SingleFamilyResidence",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1613 Maple Ln",
    "addressLocality": "Kent",
    "addressRegion": "WA",
    "postalCode": "98030"
  },
  "offers": {"@type": "Offer", "price": "899000"}
}
</script>
</head><body>listing</body></html>
"""

REDFIN_STYLE_HTML = """
<!doctype html><html><head>
<meta property="og:title" content="612 Pine St, Tacoma, WA 98402 | Redfin" />
<meta property="og:description" content="4 unit multi-family for sale at $1,150,000. Great cap rate." />
</head><body>no json-ld here</body></html>
"""

USELESS_HTML = "<html><head><title>Access denied</title></head><body>captcha</body></html>"


def test_extract_from_json_ld():
    parsed = url_parser.extract_listing(ZILLOW_STYLE_HTML)
    assert parsed["address"] == "1613 Maple Ln, Kent, WA 98030"
    assert parsed["listingPrice"] == 899000


def test_extract_from_meta_fallback():
    parsed = url_parser.extract_listing(REDFIN_STYLE_HTML)
    assert parsed["address"] == "612 Pine St, Tacoma, WA 98402"
    assert parsed["listingPrice"] == 1150000


def test_extract_nothing_returns_nulls():
    parsed = url_parser.extract_listing(USELESS_HTML)
    assert parsed == {"address": None, "listingPrice": None}


def test_validate_url_accepts_allowlisted_hosts():
    assert url_parser.validate_url("https://www.zillow.com/homedetails/x") == "www.zillow.com"
    assert url_parser.validate_url("https://redfin.com/WA/Kent/1613") == "redfin.com"


def test_validate_url_rejects_other_hosts():
    with pytest.raises(url_parser.UrlParserError):
        url_parser.validate_url("https://portal.onehome.com/property/123")
    with pytest.raises(url_parser.UrlParserError):
        url_parser.validate_url("http://169.254.169.254/latest/meta-data")
    with pytest.raises(url_parser.UrlParserError):
        url_parser.validate_url("ftp://zillow.com/x")


def test_parse_url_endpoint_happy_path(monkeypatch):
    def handler(request):
        assert "Mozilla" in request.headers["User-Agent"]
        return httpx.Response(200, text=ZILLOW_STYLE_HTML)

    monkeypatch.setattr(url_parser, "_transport", httpx.MockTransport(handler))
    body = client.post(
        "/parse-url", json={"url": "https://www.zillow.com/homedetails/1613-maple"}
    ).json()
    assert body["address"] == "1613 Maple Ln, Kent, WA 98030"
    assert body["listingPrice"] == 899000
    assert body["host"] == "www.zillow.com"


def test_parse_url_endpoint_rejects_unsupported_host():
    resp = client.post("/parse-url", json={"url": "https://example.com/listing"})
    assert resp.status_code == 400
    assert "Unsupported" in resp.json()["detail"]


def test_parse_url_endpoint_reports_blocked_fetch(monkeypatch):
    monkeypatch.setattr(
        url_parser,
        "_transport",
        httpx.MockTransport(lambda r: httpx.Response(403, text="denied")),
    )
    resp = client.post("/parse-url", json={"url": "https://www.redfin.com/WA/x"})
    assert resp.status_code == 502
    assert "blocking" in resp.json()["detail"]


def test_extra_host_allows_mock_e2e(monkeypatch):
    monkeypatch.setattr(config, "PARSE_URL_EXTRA_HOST", "localhost")
    assert url_parser.validate_url("http://localhost:9100/listing-fixture") == "localhost"
