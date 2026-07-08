"""Listing-URL parsing: fetch a listing page and extract address + price.

Best-effort by design — structured data (JSON-LD) first, OpenGraph/meta
fallbacks second. Listing sites change markup and rate-limit bots, so the
product contract is: try, and if extraction fails the user types the address
manually. Only allowlisted listing hosts are fetched (SSRF guard).
"""

import json
import re
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

from app import config

TIMEOUT_SECONDS = 12.0
_transport: httpx.AsyncBaseTransport | None = None

ALLOWED_HOSTS = ("zillow.com", "redfin.com", "realtor.com")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

PRICE_MIN, PRICE_MAX = 10_000, 100_000_000


class UrlParserError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise UrlParserError("Only http(s) listing URLs are supported")
    host = parsed.hostname.lower()
    allowed = ALLOWED_HOSTS + ((config.PARSE_URL_EXTRA_HOST,) if config.PARSE_URL_EXTRA_HOST else ())
    if not any(host == h or host.endswith("." + h) for h in allowed):
        raise UrlParserError(
            f"Unsupported listing site '{host}'. Supported: {', '.join(ALLOWED_HOSTS)}"
        )
    return host


async def fetch_page(url: str) -> str:
    async with httpx.AsyncClient(
        timeout=TIMEOUT_SECONDS,
        transport=_transport,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
    ) as client:
        try:
            resp = await client.get(url)
        except httpx.HTTPError as exc:
            raise UrlParserError(f"Could not fetch the listing page: {exc}", 502) from exc
    if resp.status_code != 200:
        raise UrlParserError(
            f"Listing page returned {resp.status_code} — the site may be blocking automated access",
            502,
        )
    return resp.text


class _MetaAndJsonLdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta: dict[str, str] = {}
        self.json_ld_blocks: list[str] = []
        self._in_json_ld = False
        self._buffer: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "meta":
            key = attrs_dict.get("property") or attrs_dict.get("name")
            content = attrs_dict.get("content")
            if key and content:
                self.meta[key.lower()] = content
        elif tag == "script" and attrs_dict.get("type", "").lower() == "application/ld+json":
            self._in_json_ld = True
            self._buffer = []

    def handle_data(self, data):
        if self._in_json_ld:
            self._buffer.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._in_json_ld:
            self._in_json_ld = False
            block = "".join(self._buffer).strip()
            if block:
                self.json_ld_blocks.append(block)


def _iter_json_ld_objects(blocks: list[str]):
    for block in blocks:
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        stack = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                yield node
                stack.extend(node.values())
            elif isinstance(node, list):
                stack.extend(node)


def _address_from_jsonld(obj: dict) -> str | None:
    addr = obj.get("address")
    if isinstance(addr, str) and len(addr) > 8:
        return addr
    if isinstance(addr, dict):
        parts = [
            addr.get("streetAddress"),
            addr.get("addressLocality"),
            addr.get("addressRegion"),
            addr.get("postalCode"),
        ]
        joined = ", ".join(str(p) for p in parts[:3] if p)
        if addr.get("postalCode") and joined:
            joined = f"{joined} {addr['postalCode']}"
        return joined or None
    return None


def _price_from_jsonld(obj: dict) -> float | None:
    offers = obj.get("offers")
    candidates = []
    if isinstance(offers, dict):
        candidates.append(offers.get("price"))
    candidates.append(obj.get("price"))
    for c in candidates:
        try:
            price = float(str(c).replace(",", "").replace("$", ""))
        except (TypeError, ValueError):
            continue
        if PRICE_MIN <= price <= PRICE_MAX:
            return price
    return None


# street, [more segments,] STATE ZIP — e.g. "612 Pine St, Tacoma, WA 98402"
ADDRESS_META_RE = re.compile(r"(\d[^|,]+(?:,\s*[^,|]+)*,\s*[A-Z]{2}\s+\d{5})")
PRICE_TEXT_RE = re.compile(r"\$\s?([\d,]{5,12})")


def extract_listing(html: str) -> dict:
    parser = _MetaAndJsonLdParser()
    parser.feed(html)

    address: str | None = None
    price: float | None = None

    for obj in _iter_json_ld_objects(parser.json_ld_blocks):
        address = address or _address_from_jsonld(obj)
        price = price or _price_from_jsonld(obj)
        if address and price:
            break

    if not address:
        for key in ("og:title", "twitter:title", "og:description", "description"):
            content = parser.meta.get(key, "")
            match = ADDRESS_META_RE.search(content)
            if match:
                address = match.group(1).strip()
                break

    if not price:
        for key in ("og:description", "description", "og:title"):
            match = PRICE_TEXT_RE.search(parser.meta.get(key, ""))
            if match:
                candidate = float(match.group(1).replace(",", ""))
                if PRICE_MIN <= candidate <= PRICE_MAX:
                    price = candidate
                    break

    return {"address": address, "listingPrice": price}
