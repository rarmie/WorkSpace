"""Phase 6 run (docs/discovery-plan.md).

Runs phases 1-5, then the Phase 8 skill tagging and dbt build, in order and stops at the first one that fails. Each phase runs
as its own process, so a crash or sys.exit(1) in one cannot leave another half
finished, and the exit code tells us exactly which step broke.

The date is computed once here and handed to every phase. Without that, a run
that crosses midnight (UTC on CI) could extract into one folder and load from
another.

    python -m pipeline.run
"""

from __future__ import annotations

import logging
import subprocess
import sys
from datetime import date

# Order matters: each phase reads what the one before it wrote.
PHASES = ["extract", "load", "stage"]  # these take --date
DB_ONLY_PHASES = ["publish", "tag_skills", "dbt_run"]  # read the database only, no --date

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("run")


def run_phase(name: str, run_date: str | None) -> None:
    command = [sys.executable, "-m", f"pipeline.{name}"]
    if run_date:
        command += ["--date", run_date]

    logger.info("=== %s ===", name)
    result = subprocess.run(command)
    if result.returncode != 0:
        # Name the phase only. The phase's own output is above; never echo
        # the command's environment, which holds DIRECT_URL.
        logger.error("phase %r failed (exit %d) - stopping", name, result.returncode)
        sys.exit(result.returncode)


def main() -> None:
    run_date = date.today().isoformat()
    logger.info("pipeline run for %s", run_date)

    for name in PHASES:
        run_phase(name, run_date)
    for name in DB_ONLY_PHASES:
        run_phase(name, None)

    logger.info("pipeline run finished")


if __name__ == "__main__":
    main()
