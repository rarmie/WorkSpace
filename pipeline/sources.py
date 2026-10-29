"""Per-source raw access (docs/discovery-plan.md).

Shared between Phase 2 (load) and Phase 3 (stage): both need to iterate a
board's postings and pull the handful of fields each source names
differently. This module has no business rules (no remote/region/level
logic) — it only knows each source's JSON shape.

    from pipeline.sources import list_postings, source_id, hash_fields
"""

from __future__ import annotations

SOURCES = ("greenhouse", "lever", "ashby")


def list_postings(source: str, body: dict) -> list[dict]:
    """The list of posting dicts in a board's raw response body."""
    if source == "greenhouse":
        return body.get("jobs", [])
    if source == "lever":
        return body if isinstance(body, list) else []
    if source == "ashby":
        # isListed defaults true in samples, but false rows are deliberately
        # unlisted by the employer — skip them, per the plan.
        return [j for j in body.get("jobs", []) if j.get("isListed", True)]
    raise ValueError(f"unknown source: {source!r}")


def source_id(source: str, posting: dict) -> str:
    """Each source's id field, normalized to a string (Greenhouse's is a number)."""
    return str(posting["id"])


def hash_fields(source: str, posting: dict) -> dict:
    """The raw (unmapped) title/location/description text that matters for
    change detection. Phase 2 hashes exactly this, not the whole posting —
    fields like Greenhouse's updated_at change on every save in the ATS,
    even with no real content change."""
    if source == "greenhouse":
        return {
            "title": posting.get("title", ""),
            "location": (posting.get("location") or {}).get("name", ""),
            "description": posting.get("content", ""),
        }
    if source == "lever":
        return {
            "title": posting.get("text", ""),
            "location": (posting.get("categories") or {}).get("location", ""),
            "description": posting.get("descriptionPlain", ""),
        }
    if source == "ashby":
        return {
            "title": posting.get("title", ""),
            "location": posting.get("location", ""),
            "description": posting.get("descriptionPlain", ""),
        }
    raise ValueError(f"unknown source: {source!r}")
