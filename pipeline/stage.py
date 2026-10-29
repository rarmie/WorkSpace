"""Phase 3 stage (docs/discovery-plan.md).

Maps each source's raw shape into one common shape, staging.posting, and
applies the location/level rules (pipeline/rules.py) so every source agrees
on what "remote" or "senior" means. Reads straight from the day's raw files
(pipeline/data/raw/<date>/), not from raw.posting_version — a posting with
unchanged content gets no new row there, but staging still needs to see it
today to know it's still open.

Closed-posting rule: a posting missing from today's file for a company
whose fetch *succeeded* today gets closed_at set. A company whose file is
missing (fetch failed) is skipped entirely — its postings keep whatever
closed_at they already had. Re-running after removing a posting from a raw
file, then restoring it, should set and then clear closed_at.

    backend/venv/Scripts/python pipeline/stage.py [--date YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import html
import json
import logging
import tomllib
from datetime import date, datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

from pipeline.db import get_connection
from pipeline.rules import parse_level, parse_location
from pipeline.sources import list_postings, source_id

COMPANIES_PATH = Path(__file__).parent / "companies.toml"
DATA_ROOT = Path(__file__).parent / "data" / "raw"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("stage")

CREATE_SCHEMA_SQL = """
create schema if not exists staging;

create table if not exists staging.posting (
    id bigserial primary key,
    source text not null,
    source_id text not null,
    company text not null,
    title text not null,
    level text,
    location text not null,
    is_remote boolean not null,
    regions text[] not null default '{}',
    url text not null,
    description text not null,
    posted_at timestamptz,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    closed_at timestamptz,
    unique (source, source_id)
);
"""

UPSERT_SQL = """
insert into staging.posting
    (source, source_id, company, title, level, location, is_remote, regions, url, description, posted_at)
values
    (%(source)s, %(source_id)s, %(company)s, %(title)s, %(level)s, %(location)s, %(is_remote)s,
     %(regions)s, %(url)s, %(description)s, %(posted_at)s)
on conflict (source, source_id) do update set
    company = excluded.company,
    title = excluded.title,
    level = excluded.level,
    location = excluded.location,
    is_remote = excluded.is_remote,
    regions = excluded.regions,
    url = excluded.url,
    description = excluded.description,
    posted_at = excluded.posted_at,
    last_seen_at = now(),
    closed_at = null
"""

CLOSE_SQL = """
update staging.posting
set closed_at = now()
where source = %s and company = %s and closed_at is null and not (source_id = any(%s))
"""


def strip_html(raw_html: str) -> str:
    """Greenhouse's content is HTML, and HTML-escaped on top of that
    (&lt;p&gt; rather than <p>) — unescape before parsing or BeautifulSoup
    just sees text full of literal angle-bracket entities."""
    unescaped = html.unescape(raw_html or "")
    return BeautifulSoup(unescaped, "lxml").get_text(separator="\n").strip()


def parse_posted_at(value: object) -> datetime | None:
    if not value:
        return None
    if isinstance(value, (int, float)):
        # Lever's createdAt is a Unix timestamp in milliseconds.
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def map_greenhouse(posting: dict, company: str) -> dict:
    title = posting.get("title", "")
    location_text = (posting.get("location") or {}).get("name", "")
    is_remote, regions = parse_location(location_text)
    return {
        "title": title,
        "company": company,
        "level": parse_level(title),
        "location": location_text,
        "is_remote": is_remote,
        "regions": regions,
        "url": posting.get("absolute_url", ""),
        "description": strip_html(posting.get("content", "")),
        "posted_at": parse_posted_at(posting.get("first_published")),
    }


def map_lever(posting: dict, company: str) -> dict:
    title = posting.get("text", "")
    location_text = (posting.get("categories") or {}).get("location", "")
    is_remote, regions = parse_location(location_text)
    return {
        "title": title,
        "company": company,
        "level": parse_level(title),
        "location": location_text,
        "is_remote": is_remote,
        "regions": regions,
        "url": posting.get("hostedUrl", ""),
        "description": (posting.get("descriptionPlain") or "").strip(),
        "posted_at": parse_posted_at(posting.get("createdAt")),
    }


def map_ashby(posting: dict, company: str) -> dict:
    title = posting.get("title", "")
    location_text = posting.get("location", "")
    secondary = [
        s.get("location", "") if isinstance(s, dict) else str(s) for s in (posting.get("secondaryLocations") or [])
    ]
    is_remote, regions = parse_location(location_text, *secondary)
    return {
        "title": title,
        "company": company,
        "level": parse_level(title),
        "location": location_text,
        "is_remote": is_remote,
        "regions": regions,
        "url": posting.get("jobUrl", ""),
        "description": (posting.get("descriptionPlain") or "").strip(),
        "posted_at": parse_posted_at(posting.get("publishedAt")),
    }


MAPPERS = {"greenhouse": map_greenhouse, "lever": map_lever, "ashby": map_ashby}


def load_companies(path: Path) -> list[dict]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return data["board"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=date.today().isoformat())
    args = parser.parse_args()

    raw_dir = DATA_ROOT / args.date
    companies = load_companies(COMPANIES_PATH)

    with_region = 0
    with_level = 0
    total_open = 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_SCHEMA_SQL)

        for board in companies:
            source, slug, company = board["source"], board["slug"], board["company"]
            path = raw_dir / f"{source}-{slug}.json"
            if not path.exists():
                logger.warning(
                    "%s (%s): no raw file for %s - fetch must have failed, leaving its postings untouched",
                    company,
                    source,
                    args.date,
                )
                continue

            body = json.loads(path.read_text(encoding="utf-8"))
            postings = list_postings(source, body)
            mapper = MAPPERS[source]

            seen_ids: list[str] = []
            with conn.cursor() as cur:
                for posting in postings:
                    sid = source_id(source, posting)
                    seen_ids.append(sid)
                    mapped = mapper(posting, company)
                    cur.execute(UPSERT_SQL, {"source": source, "source_id": sid, **mapped})

                    total_open += 1
                    if mapped["regions"]:
                        with_region += 1
                    if mapped["level"]:
                        with_level += 1

            with conn.cursor() as cur:
                cur.execute(CLOSE_SQL, (source, company, seen_ids))
                closed = cur.rowcount

            logger.info("%s (%s): %d posting(s) staged, %d closed", company, source, len(postings), closed)

        conn.commit()

    if total_open:
        logger.info(
            "Coverage: %d/%d (%.0f%%) with a region, %d/%d (%.0f%%) with a level",
            with_region,
            total_open,
            100 * with_region / total_open,
            with_level,
            total_open,
            100 * with_level / total_open,
        )


if __name__ == "__main__":
    main()
