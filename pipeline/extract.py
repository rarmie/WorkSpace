"""Phase 1 extract (docs/discovery-plan.md).

Fetches each company's postings from companies.toml and saves the raw,
untouched response to pipeline/data/raw/<date>/<source>-<slug>.json. Every
later phase re-reads these files instead of re-fetching, so what lands here
must be exactly what the source returned — no reformatting, no reparsing.

    backend/venv/Scripts/python pipeline/extract.py
"""

from __future__ import annotations

import logging
import time
import tomllib
from datetime import date
from pathlib import Path

import httpx

USER_AGENT = "ShortlistBot/0.1 (+https://github.com/rarmie/shortlist-job-tracker)"
REQUEST_DELAY_SECONDS = 1.0  # Lever's Crawl-delay: 1 is the floor; apply it to all three sources.
REQUEST_TIMEOUT_SECONDS = 10.0

COMPANIES_PATH = Path(__file__).parent / "companies.toml"
DATA_ROOT = Path(__file__).parent / "data" / "raw"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("extract")


def source_url(source: str, slug: str) -> str:
    if source == "greenhouse":
        return f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
    if source == "lever":
        return f"https://api.lever.co/v0/postings/{slug}?mode=json"
    if source == "ashby":
        return f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    raise ValueError(f"unknown source: {source!r}")


def fetch_raw(client: httpx.Client, source: str, slug: str) -> bytes | None:
    """Return the exact response body, or None if this board couldn't be
    fetched today. Never raises — one bad board must not stop the run."""
    url = source_url(source, slug)
    try:
        resp = client.get(url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT_SECONDS)
    except httpx.TimeoutException:
        logger.error("%s/%s: timed out", source, slug)
        return None
    except httpx.HTTPError as exc:
        logger.error("%s/%s: request failed (%s)", source, slug, exc)
        return None

    # 403/429 mean the run is being blocked or throttled, not that the board
    # is empty — log them separately so a scheduled run's failure is easy to
    # tell apart from "this company just has zero postings."
    if resp.status_code == 403:
        logger.warning("%s/%s: HTTP 403 — likely blocked", source, slug)
        return None
    if resp.status_code == 429:
        logger.warning("%s/%s: HTTP 429 — rate limited", source, slug)
        return None
    if resp.status_code != 200:
        logger.error("%s/%s: HTTP %s", source, slug, resp.status_code)
        return None

    return resp.content


def load_companies(path: Path) -> list[dict]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return data["board"]


def main() -> None:
    companies = load_companies(COMPANIES_PATH)
    out_dir = DATA_ROOT / date.today().isoformat()
    out_dir.mkdir(parents=True, exist_ok=True)

    saved = 0
    with httpx.Client() as client:
        for i, board in enumerate(companies):
            source, slug, company = board["source"], board["slug"], board["company"]
            body = fetch_raw(client, source, slug)
            if body is not None:
                out_path = out_dir / f"{source}-{slug}.json"
                out_path.write_bytes(body)
                logger.info("%s (%s): saved %s (%d bytes)", company, source, out_path.name, len(body))
                saved += 1
            if i < len(companies) - 1:
                time.sleep(REQUEST_DELAY_SECONDS)

    logger.info("Done: %d/%d companies saved to %s", saved, len(companies), out_dir)


if __name__ == "__main__":
    main()
