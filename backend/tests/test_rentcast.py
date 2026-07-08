import httpx
import pytest

from app import config
from app.services import rentcast
from app.services.rentcast import RentCastError


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _use_transport(monkeypatch, handler):
    monkeypatch.setattr(config, "RENTCAST_API_KEY", "test-key")
    monkeypatch.setattr(rentcast, "_transport", httpx.MockTransport(handler))


@pytest.mark.anyio
async def test_property_records_returns_first_of_list(monkeypatch):
    def handler(request):
        assert request.headers["X-Api-Key"] == "test-key"
        assert request.url.path == "/v1/properties"
        return httpx.Response(
            200, json=[{"formattedAddress": "First"}, {"formattedAddress": "Second"}]
        )

    _use_transport(monkeypatch, handler)
    result = await rentcast.get_property_records("some address, somewhere")
    assert result == {"formattedAddress": "First"}


@pytest.mark.anyio
async def test_404_maps_to_none(monkeypatch):
    def handler(request):
        return httpx.Response(404, json={"error": "no data"})

    _use_transport(monkeypatch, handler)
    assert await rentcast.get_value_estimate("nowhere") is None


@pytest.mark.anyio
async def test_server_error_raises_rentcast_error(monkeypatch):
    def handler(request):
        return httpx.Response(500, text="internal error")

    _use_transport(monkeypatch, handler)
    with pytest.raises(RentCastError) as exc_info:
        await rentcast.get_rent_estimate("some address, somewhere")
    assert exc_info.value.status_code == 500


@pytest.mark.anyio
async def test_missing_key_raises_before_any_request(monkeypatch):
    monkeypatch.setattr(config, "RENTCAST_API_KEY", "")
    with pytest.raises(RentCastError, match="not configured"):
        await rentcast.get_property_records("some address, somewhere")


@pytest.mark.anyio
async def test_placeholder_key_raises(monkeypatch):
    monkeypatch.setattr(config, "RENTCAST_API_KEY", "PASTE_YOUR_KEY_HERE")
    with pytest.raises(RentCastError, match="not configured"):
        await rentcast.get_property_records("some address, somewhere")
