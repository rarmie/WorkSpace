"""Phase 0 board scout (docs/discovery-plan.md).

Fetches every candidate board once, measures how many of its postings are
actually reachable from the Philippines, and prints a per-board count so a
human can decide which boards earn a spot in companies.toml.

Deliberately rough: location/level matching here is plain keyword checks,
not the real rules Phase 3 will build. Re-run monthly; companies change
hiring regions and ATS providers.

    backend/venv/Scripts/python pipeline/scout.py
"""

from __future__ import annotations

import time
import tomllib
from dataclasses import dataclass
from pathlib import Path

import httpx

USER_AGENT = "ShortlistBot/0.1 (+https://github.com/rarmie/shortlist-job-tracker)"
REQUEST_DELAY_SECONDS = 1.0
REACHABLE_THRESHOLD = 3

# Rough keyword lists. Phase 3 will build the real location/level rules;
# until then this is intentionally approximate.
REACHABLE_REGION_WORDS = ("philippines", "apac", "global", "worldwide", "anywhere")
ENGINEERING_WORDS = ("engineer", "developer", "programmer", "swe", "sde")
SENIOR_WORDS = ("senior", "sr.", "sr ", "staff", "principal", "lead")

CANDIDATES_PATH = Path(__file__).parent / "candidates.toml"
COMPANIES_PATH = Path(__file__).parent / "companies.toml"


@dataclass
class Candidate:
    company: str
    source: str
    slug: str


@dataclass
class ScoutResult:
    candidate: Candidate
    total: int = 0
    reachable: int = 0
    reachable_engineering: int = 0
    reachable_engineering_not_senior: int = 0
    error: str | None = None


def load_candidates(path: Path) -> list[Candidate]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return [Candidate(company=b["company"], source=b["source"], slug=b["slug"]) for b in data["board"]]


def fetch_board(client: httpx.Client, candidate: Candidate) -> list[dict] | None:
    """Return a list of normalized {"title": ..., "location": ...} dicts, or
    None if the board couldn't be fetched. Never raises for a single bad
    board — the caller logs and moves on to the next one."""
    if candidate.source == "greenhouse":
        url = f"https://boards-api.greenhouse.io/v1/boards/{candidate.slug}/jobs"
    elif candidate.source == "lever":
        url = f"https://api.lever.co/v0/postings/{candidate.slug}?mode=json"
    elif candidate.source == "ashby":
        url = f"https://api.ashbyhq.com/posting-api/job-board/{candidate.slug}"
    else:
        print(f"  ! unknown source {candidate.source!r} for {candidate.company}")
        return None

    try:
        resp = client.get(url, headers={"User-Agent": USER_AGENT}, timeout=10.0)
    except httpx.TimeoutException:
        print(f"  ! {candidate.company}: timed out")
        return None
    except httpx.HTTPError as exc:
        print(f"  ! {candidate.company}: request failed ({exc})")
        return None

    if resp.status_code == 403:
        print(f"  ! {candidate.company}: HTTP 403 (blocked)")
        return None
    if resp.status_code == 429:
        print(f"  ! {candidate.company}: HTTP 429 (rate limited)")
        return None
    if resp.status_code != 200:
        print(f"  ! {candidate.company}: HTTP {resp.status_code}")
        return None

    body = resp.json()

    if candidate.source == "greenhouse":
        jobs = body.get("jobs", [])
        return [{"title": j.get("title", ""), "location": (j.get("location") or {}).get("name", "")} for j in jobs]

    if candidate.source == "lever":
        jobs = body if isinstance(body, list) else []
        return [
            {"title": j.get("text", ""), "location": (j.get("categories") or {}).get("location", "")}
            for j in jobs
        ]

    if candidate.source == "ashby":
        jobs = [j for j in body.get("jobs", []) if j.get("isListed", True)]
        return [{"title": j.get("title", ""), "location": j.get("location", "")} for j in jobs]

    return None


def is_reachable(location: str) -> bool:
    # Bare "Remote" with no stated country/region is unknown, not global — it
    # most often means remote within one (usually US) country. Only count a
    # posting as reachable when the text actually names the Philippines or a
    # broad region that would include it.
    text = location.lower()
    return any(word in text for word in REACHABLE_REGION_WORDS)


def is_engineering(title: str) -> bool:
    text = title.lower()
    return any(word in text for word in ENGINEERING_WORDS)


def is_senior(title: str) -> bool:
    text = title.lower()
    return any(word in text for word in SENIOR_WORDS)


def scout_one(client: httpx.Client, candidate: Candidate) -> ScoutResult:
    jobs = fetch_board(client, candidate)
    if jobs is None:
        return ScoutResult(candidate=candidate, error="fetch failed")

    result = ScoutResult(candidate=candidate, total=len(jobs))
    for job in jobs:
        if not is_reachable(job["location"]):
            continue
        result.reachable += 1
        if not is_engineering(job["title"]):
            continue
        result.reachable_engineering += 1
        if not is_senior(job["title"]):
            result.reachable_engineering_not_senior += 1

    return result


def write_companies_toml(results: list[ScoutResult]) -> list[ScoutResult]:
    passed = [r for r in results if r.reachable_engineering_not_senior >= REACHABLE_THRESHOLD]

    lines = [
        "# Boards the scout measured with at least"
        f" {REACHABLE_THRESHOLD} reachable, non-senior engineering roles.",
        "# Generated by pipeline/scout.py — re-run monthly, don't hand-edit the counts.",
        "",
    ]
    for r in passed:
        lines += [
            "[[board]]",
            f'company = "{r.candidate.company}"',
            f'source = "{r.candidate.source}"',
            f'slug = "{r.candidate.slug}"',
            f"# reachable={r.reachable} engineering={r.reachable_engineering}"
            f" not_senior={r.reachable_engineering_not_senior} total={r.total}",
            "",
        ]
    COMPANIES_PATH.write_text("\n".join(lines), encoding="utf-8")
    return passed


def main() -> None:
    candidates = load_candidates(CANDIDATES_PATH)
    print(f"Scouting {len(candidates)} candidate boards...\n")

    results: list[ScoutResult] = []
    with httpx.Client() as client:
        for i, candidate in enumerate(candidates):
            result = scout_one(client, candidate)
            results.append(result)
            if result.error:
                print(f"{candidate.company:<24} {candidate.source:<10} FAILED ({result.error})")
            else:
                print(
                    f"{candidate.company:<24} {candidate.source:<10} "
                    f"total={result.total:<5} reachable={result.reachable:<5} "
                    f"eng={result.reachable_engineering:<5} not_senior={result.reachable_engineering_not_senior}"
                )
            if i < len(candidates) - 1:
                time.sleep(REQUEST_DELAY_SECONDS)

    passed = write_companies_toml(results)
    print(f"\n{len(passed)} board(s) passed the {REACHABLE_THRESHOLD}-reachable-engineering-role bar:")
    for r in passed:
        print(f"  - {r.candidate.company} ({r.candidate.source}/{r.candidate.slug})")
    print(f"\nWrote {COMPANIES_PATH}")


if __name__ == "__main__":
    main()
