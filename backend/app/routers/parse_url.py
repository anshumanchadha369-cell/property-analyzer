from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services import url_parser

router = APIRouter()


class ParseUrlRequest(BaseModel):
    url: str = Field(min_length=12, max_length=2000)


@router.post("/parse-url")
async def parse_url(req: ParseUrlRequest):
    try:
        host = url_parser.validate_url(req.url.strip())
        html = await url_parser.fetch_page(req.url.strip())
    except url_parser.UrlParserError as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})

    parsed = url_parser.extract_listing(html)
    return {"host": host, **parsed}
