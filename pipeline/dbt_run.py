"""Phase 8 dbt step (docs/discovery-plan.md).

Runs `dbt build` (build the models, then run their tests) for the dbt/ project.

dbt wants host, user, password and so on as separate settings, while the rest
of the pipeline uses one DIRECT_URL string. This script splits DIRECT_URL into
the DBT_* environment variables that dbt/profiles.yml reads, then calls dbt.
It exits 1 if any model or test fails, so pipeline/run.py stops the run.

    pipeline/venv/Scripts/python -m pipeline.dbt_run
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

DBT_DIR = Path(__file__).parent.parent / "dbt"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("dbt_run")


def set_dbt_env(direct_url: str) -> None:
    parsed = urlparse(direct_url)
    os.environ["DBT_HOST"] = parsed.hostname or ""
    os.environ["DBT_PORT"] = str(parsed.port or 5432)
    # The password may hold characters that were percent-encoded in the URL.
    os.environ["DBT_USER"] = unquote(parsed.username or "")
    os.environ["DBT_PASSWORD"] = unquote(parsed.password or "")
    os.environ["DBT_DBNAME"] = parsed.path.lstrip("/")


def main() -> None:
    load_dotenv()
    direct_url = os.environ.get("DIRECT_URL")
    if not direct_url:
        raise RuntimeError("DIRECT_URL is not set — check .env")
    set_dbt_env(direct_url)

    # Imported here so a missing dbt install fails with a clear message, not at import time.
    from dbt.cli.main import dbtRunner

    result = dbtRunner().invoke(["build", "--project-dir", str(DBT_DIR), "--profiles-dir", str(DBT_DIR)])
    if not result.success:
        logger.error("dbt build failed")
        sys.exit(1)
    logger.info("dbt build finished")


if __name__ == "__main__":
    main()
