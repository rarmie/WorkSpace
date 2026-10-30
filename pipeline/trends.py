"""Phase 8 skill trends (docs/discovery-plan.md).

Counts, per week, how many postings name each skill in their requirement
bullets, and writes the result to public."SkillTrend".

A posting counts in the week it was first seen (firstSeenAt), including
postings that have since closed: they were part of that week's market. This
needs no snapshots, so every run recomputes the same answer from the data
already in "DiscoveredPosting".

The first week is a baseline, not a trend: everything open on the day the
pipeline first ran lands in it. Compare weeks from the second one onward.

The table is rebuilt in one transaction (delete, then insert), so a changed
skill list in pipeline/skills.py never leaves stale rows, and readers never
see it half empty.

    backend/venv/Scripts/python -m pipeline.trends
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import date, datetime, timedelta

from pipeline.db import get_connection
from pipeline.skills import skills_in

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("trends")


def week_start(moment: datetime) -> date:
    """The Monday of the week a timestamp falls in (UTC date)."""
    day = moment.date()
    return day - timedelta(days=day.weekday())


def count_skills(rows: list[tuple[datetime, list[str]]]) -> tuple[Counter, Counter]:
    """Returns (skill counts keyed by (week, skill), totals keyed by week).

    A posting with no requirement bullets is skipped, not counted in the
    total: it would only dilute every skill's share without saying anything.
    """
    per_skill: Counter = Counter()
    totals: Counter = Counter()
    for first_seen_at, requirements in rows:
        if not requirements:
            continue
        week = week_start(first_seen_at)
        totals[week] += 1
        for skill in skills_in(requirements):
            per_skill[(week, skill)] += 1
    return per_skill, totals


def main() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute('select "firstSeenAt", requirements from "DiscoveredPosting"')
            rows = cur.fetchall()

        per_skill, totals = count_skills(rows)
        trend_rows = [
            (str(week), skill, count, totals[week]) for (week, skill), count in sorted(per_skill.items())
        ]

        with conn.cursor() as cur:
            cur.execute('delete from "SkillTrend"')
            cur.executemany(
                """
                insert into "SkillTrend" (id, "weekStart", skill, postings, "totalPostings")
                values (gen_random_uuid()::text, %s, %s, %s, %s)
                """,
                trend_rows,
            )
        conn.commit()

    logger.info("Skill trends: %d row(s) across %d week(s) from %d posting(s)", len(trend_rows), len(totals), len(rows))
    latest = max(totals) if totals else None
    if latest:
        top = sorted(((c, s) for (w, s), c in per_skill.items() if w == latest), reverse=True)[:5]
        logger.info("Latest week %s (%d postings): %s", latest, totals[latest], ", ".join(f"{s} {c}" for c, s in top))


if __name__ == "__main__":
    main()
