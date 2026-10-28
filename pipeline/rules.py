"""Location and level rules (Phase 3, docs/discovery-plan.md).

Rule-based, not AI: cheap, deterministic, and measurable. Each run should
print what share of postings got a region/level so a gap is visible instead
of silently swallowed (see stage.py's coverage log).

Kept separate from scout.py's rough keyword lists on purpose — scout.py was
deliberately approximate, written before these rules existed (28 Oct note).
Pointing scout.py at this module instead is a follow-up, not done here.
"""

from __future__ import annotations

import re

# Ordered (code, pattern) pairs. Patterns are matched with re.search against
# the lowercased location text, so order only matters where one pattern is a
# substring of another's match (it isn't here) — order is otherwise just
# "roughly most → least specific" for readability.
#
# Deliberately NOT matching bare two-letter codes like "ph", "us", "ca" —
# those collide with ordinary words and city names ("Philadelphia",
# "campus", "Canada" itself isn't a problem, but a bare "CA" is also the
# abbreviation for California). Every pattern below is a full word or
# phrase that only means the country/region it's mapped to.
_REGION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("GLOBAL", re.compile(r"\b(global|worldwide|anywhere)\b")),
    ("APAC", re.compile(r"\bapac\b")),
    ("EMEA", re.compile(r"\bemea\b")),
    ("AMER", re.compile(r"\bamer(icas)?\b")),
    ("PH", re.compile(r"\bphil+ippines\b")),  # samples include the typo "Phillippines"
    ("US", re.compile(r"\b(united states|usa|us)\b")),
    ("UK", re.compile(r"\b(united kingdom|uk)\b")),
    ("CA", re.compile(r"\bcanada\b")),
    ("CN", re.compile(r"\bchina\b")),
    ("TW", re.compile(r"\btaiwan\b")),
    ("JP", re.compile(r"\bjapan\b")),
)

_REMOTE_PATTERN = re.compile(r"\b(remote|home[\s-]?based|anywhere)\b")

_LEVEL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("INTERN", re.compile(r"\bintern(ship)?\b")),
    # Checked before JUNIOR: a title mixing both ("Senior Associate") should
    # read as senior — seniority words are the stronger signal.
    ("SENIOR", re.compile(r"\b(senior|sr\.?|staff|principal|lead)\b")),
    ("JUNIOR", re.compile(r"\b(junior|associate|graduate|entry)\b")),
)


def parse_location(*texts: str) -> tuple[bool, list[str]]:
    """is_remote, regions — from one or more location strings (a primary
    location plus, for Ashby, secondaryLocations) joined and matched as one.

    Bare "Remote" with nothing else gets is_remote=True but regions=[]: it's
    unknown, not global, per the plan's explicit rule."""
    combined = "; ".join(t for t in texts if t).lower()
    is_remote = bool(_REMOTE_PATTERN.search(combined))
    regions = [code for code, pattern in _REGION_PATTERNS if pattern.search(combined)]
    return is_remote, regions


def parse_level(title: str) -> str | None:
    """INTERN / SENIOR / JUNIOR from title words, or None (unknown, not mid)."""
    text = title.lower()
    for code, pattern in _LEVEL_PATTERNS:
        if pattern.search(text):
            return code
    return None
