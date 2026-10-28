"""Phase 5 publish (docs/discovery-plan.md).

Upserts staging.posting (Phase 3) into public."DiscoveredPosting" — the
only table the app reads. Phase 4's requirement bullets aren't stored
anywhere yet, so this step re-derives them from each posting's latest raw
blob in raw.posting_version, joined in with one query rather than one
round trip per posting.

Fails the run — writes nothing — rather than publish bad data: an empty
title/company/url, a duplicate (source, sourceId), or the open-posting
count dropping by more than half since the last publish. That drop is the
signature of a source changing shape (a field rename breaking the
mapper), not of half the jobs actually closing in one day.

    backend/venv/Scripts/python -m pipeline.publish
"""

from __future__ import annotations

import logging
import sys
import uuid

from pipeline.db import get_connection
from pipeline.requirements import extract_requirements

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("publish")

# Below this fraction of the previous run's open count, the run is treated
# as broken rather than as "half the jobs closed today."
OPEN_DROP_FAILS_RUN_BELOW = 0.5


def fetch_staging_rows(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select source, source_id, company, title, level, location, is_remote,
                   regions, url, posted_at, first_seen_at, closed_at
            from staging.posting
            """
        )
        columns = [col.name for col in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def fetch_latest_raw(conn) -> dict[tuple[str, str], dict]:
    """The most recent raw blob per (source, source_id). staging.posting
    doesn't keep the original HTML, so requirement extraction (Phase 4)
    has to go back to raw.posting_version for it."""
    with conn.cursor() as cur:
        cur.execute(
            """
            select distinct on (source, source_id) source, source_id, raw
            from raw.posting_version
            order by source, source_id, fetched_at desc
            """
        )
        return {(row[0], row[1]): row[2] for row in cur.fetchall()}


def fetch_previous_open_count(conn) -> int:
    with conn.cursor() as cur:
        cur.execute('select count(*) from "DiscoveredPosting" where "closedAt" is null')
        return cur.fetchone()[0]


UPSERT_SQL = """
insert into "DiscoveredPosting"
    (id, source, "sourceId", company, role, level, location, "isRemote", regions,
     url, requirements, "postedAt", "firstSeenAt", "closedAt")
values
    (%(id)s, %(source)s, %(source_id)s, %(company)s, %(role)s, %(level)s, %(location)s,
     %(is_remote)s, %(regions)s, %(url)s, %(requirements)s, %(posted_at)s, %(first_seen_at)s,
     %(closed_at)s)
on conflict (source, "sourceId") do update set
    company = excluded.company,
    role = excluded.role,
    level = excluded.level,
    location = excluded.location,
    "isRemote" = excluded."isRemote",
    regions = excluded.regions,
    url = excluded.url,
    requirements = excluded.requirements,
    "postedAt" = excluded."postedAt",
    "firstSeenAt" = excluded."firstSeenAt",
    "closedAt" = excluded."closedAt"
"""


def build_rows(staging_rows: list[dict], raw_by_posting: dict[tuple[str, str], dict]) -> list[dict]:
    """Validates and shapes staging rows for the upsert. Exits the process
    (publishing nothing) on the first broken row or duplicate key — this
    is the "fail the run" data check, not a per-row skip."""
    rows = []
    seen_keys: set[tuple[str, str]] = set()
    for row in staging_rows:
        key = (row["source"], row["source_id"])
        if key in seen_keys:
            logger.error("duplicate posting in staging.posting: %s/%s", *key)
            sys.exit(1)
        seen_keys.add(key)

        if not row["title"].strip() or not row["company"].strip() or not row["url"].strip():
            logger.error("empty title/company/url for %s/%s", *key)
            sys.exit(1)

        raw = raw_by_posting.get(key)
        requirements = extract_requirements(row["source"], raw) if raw else []

        rows.append(
            {
                "id": str(uuid.uuid4()),
                "source": row["source"],
                "source_id": row["source_id"],
                "company": row["company"],
                "role": row["title"],
                "level": row["level"],
                "location": row["location"],
                "is_remote": row["is_remote"],
                "regions": row["regions"],
                "url": row["url"],
                "requirements": requirements,
                "posted_at": row["posted_at"],
                "first_seen_at": row["first_seen_at"],
                "closed_at": row["closed_at"],
            }
        )
    return rows


def main() -> None:
    with get_connection() as conn:
        staging_rows = fetch_staging_rows(conn)
        raw_by_posting = fetch_latest_raw(conn)
        previous_open = fetch_previous_open_count(conn)

        rows = build_rows(staging_rows, raw_by_posting)

        new_open = sum(1 for row in rows if row["closed_at"] is None)
        if previous_open > 0 and new_open < previous_open * OPEN_DROP_FAILS_RUN_BELOW:
            logger.error(
                "open posting count dropped from %d to %d (more than half) — aborting, publishing nothing",
                previous_open,
                new_open,
            )
            sys.exit(1)

        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, row)
        conn.commit()

    logger.info("Published %d posting(s): %d open (previously %d)", len(rows), new_open, previous_open)


if __name__ == "__main__":
    main()
