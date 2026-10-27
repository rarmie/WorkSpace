"""Shared database connection for the pipeline.

Uses DIRECT_URL (the same unpooled connection string prisma.config.ts uses
for migrations), not DATABASE_URL — the pipeline runs as a single batch job,
not many concurrent requests, so it doesn't need Supabase's pooler.

    from pipeline.db import get_connection

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1")
"""

from __future__ import annotations

import os

import psycopg
from dotenv import load_dotenv

load_dotenv()


def get_connection() -> psycopg.Connection:
    url = os.environ.get("DIRECT_URL")
    if not url:
        raise RuntimeError("DIRECT_URL is not set — check .env")
    return psycopg.connect(url)


if __name__ == "__main__":
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("select schema_name from information_schema.schemata order by schema_name")
            schemas = [row[0] for row in cur.fetchall()]
    print("Connected. Schemas visible:", ", ".join(schemas))
