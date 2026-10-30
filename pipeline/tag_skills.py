"""Phase 8 skill tagging (docs/discovery-plan.md).

Finds which skills (pipeline/skills.py) each published posting names in its
requirement bullets, and writes one row per posting per skill into
staging.posting_skill. The matching is Python (regexes), which SQL can't do
well, so it stays here; the weekly counting on top of it is dbt's job
(dbt/models/skill_trend.sql).

The table is rebuilt in one transaction (delete, then insert), so a changed
skill list never leaves stale rows, and dbt never reads it half empty.

    pipeline/venv/Scripts/python -m pipeline.tag_skills
"""

from __future__ import annotations

import logging

from pipeline.db import get_connection
from pipeline.skills import skills_in

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("tag_skills")

CREATE_SQL = """
create schema if not exists staging;

create table if not exists staging.posting_skill (
    source text not null,
    source_id text not null,
    skill text not null,
    primary key (source, source_id, skill)
);
"""


def main() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_SQL)
            cur.execute('select source, "sourceId", requirements from "DiscoveredPosting"')
            postings = cur.fetchall()

        rows = [
            (source, source_id, skill)
            for source, source_id, requirements in postings
            for skill in sorted(skills_in(requirements))
        ]

        with conn.cursor() as cur:
            cur.execute("delete from staging.posting_skill")
            cur.executemany("insert into staging.posting_skill (source, source_id, skill) values (%s, %s, %s)", rows)
        conn.commit()

    logger.info("Tagged %d skill(s) across %d posting(s)", len(rows), len(postings))


if __name__ == "__main__":
    main()
