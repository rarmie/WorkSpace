"""Phase 2 load raw (docs/discovery-plan.md).

Reads the day's saved responses from pipeline/data/raw/<date>/ (Phase 1's
output) and inserts one row per posting *version* into raw.posting_version —
a new row only when the hashed fields (title, location, description) changed
since the last version seen for that posting. Re-running the same day's
files twice must add zero rows the second time; that's the idempotency
check this phase exists to pass.

This step does no business logic: no remote/region/level parsing, no HTML
cleaning. That's Phase 3. Phase 2 only answers "did this posting's content
change since we last saw it?".

    backend/venv/Scripts/python pipeline/load.py [--date YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import tomllib
from datetime import date
from pathlib import Path

from pipeline.db import get_connection
from pipeline.sources import hash_fields, list_postings, source_id

COMPANIES_PATH = Path(__file__).parent / "companies.toml"
DATA_ROOT = Path(__file__).parent / "data" / "raw"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("load")

CREATE_SCHEMA_SQL = """
create schema if not exists raw;

create table if not exists raw.posting_version (
    id bigserial primary key,
    source text not null,
    company text not null,
    source_id text not null,
    content_hash text not null,
    raw jsonb not null,
    fetched_at timestamptz not null default now(),
    unique (source, source_id, content_hash)
);

create index if not exists posting_version_source_id_idx
    on raw.posting_version (source, source_id);
"""


def load_companies(path: Path) -> list[dict]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return data["board"]


def content_hash(source: str, posting: dict) -> str:
    fields = hash_fields(source, posting)
    canonical = json.dumps(fields, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=date.today().isoformat())
    args = parser.parse_args()

    raw_dir = DATA_ROOT / args.date
    companies = load_companies(COMPANIES_PATH)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_SCHEMA_SQL)

        total_postings = 0
        total_new = 0
        for board in companies:
            source, slug, company = board["source"], board["slug"], board["company"]
            path = raw_dir / f"{source}-{slug}.json"
            if not path.exists():
                logger.warning("%s (%s): no raw file for %s - fetch must have failed, skipping", company, source, args.date)
                continue

            body = json.loads(path.read_text(encoding="utf-8"))
            postings = list_postings(source, body)
            new_for_company = 0
            with conn.cursor() as cur:
                for posting in postings:
                    cur.execute(
                        """
                        insert into raw.posting_version (source, company, source_id, content_hash, raw)
                        values (%s, %s, %s, %s, %s)
                        on conflict (source, source_id, content_hash) do nothing
                        """,
                        (source, company, source_id(source, posting), content_hash(source, posting), json.dumps(posting)),
                    )
                    new_for_company += cur.rowcount

            total_postings += len(postings)
            total_new += new_for_company
            logger.info("%s (%s): %d posting(s), %d new version(s)", company, source, len(postings), new_for_company)

        conn.commit()

    logger.info("Done: %d new version(s) from %d posting(s) across %d board(s)", total_new, total_postings, len(companies))


if __name__ == "__main__":
    main()
