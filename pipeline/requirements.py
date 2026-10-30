"""Phase 4 requirements, by rules (docs/discovery-plan.md).

Pulls requirement bullets out of each source's description using heading
patterns, not AI — cheap, deterministic, and its coverage number is exactly
what decides whether Phase 8's AI step is worth paying for.

Lever's `lists` field already separates a posting into heading + bullets,
so no HTML walking is needed there. Greenhouse's `content` and Ashby's
`descriptionHtml` are one HTML blob; both get the same heading-then-list
walk, since one HTML parser serves both (per the plan).

Untested against real Lever data: no Lever board exists in companies.toml
yet (28 Oct's scout found none), so extract_from_lever_lists() is written
from Lever's documented `lists` shape only, never verified against a live
response.

    backend/venv/Scripts/python -m pipeline.requirements [--date YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import html
import json
import logging
import tomllib
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup, Tag

from pipeline.sources import list_postings

COMPANIES_PATH = Path(__file__).parent / "companies.toml"
DATA_ROOT = Path(__file__).parent / "data" / "raw"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("requirements")

# Rough heading-text matches, lowercased substring search. Headings for
# other sections ("responsibilities", "benefits", "about us") are
# deliberately left out — folding those in would trade precision for
# coverage with no clear win.
HEADING_PATTERNS = (
    "requirement",
    "qualification",
    "who you are",
    "what we require",
    "you have",
    "must have",
    "nice to have",
    "looking for",
    "what you need",
    "what you'll need",
    "good fit",
    "you are",
    "you bring",
    "you'll bring",
    "preferred experience",
    # Added 31 Oct after reading the 27 Canonical postings the list above missed.
    "required skills",
    "valued skills",
    "desirable skills",
    "desired characteristics",
    "skills and experience",
    "will bring",
    "additional skills",
    "optional skills",
    "nice-to-have",
    "we value",
    "strong candidate",
    "lo que buscamos",  # Spanish: "what we look for in you"
)


def _is_requirements_heading(text: str) -> bool:
    # Normalize curly apostrophes ("You’ll Bring") to straight ones so the
    # patterns above only need to be written one way.
    lowered = text.lower().replace("’", "'").replace("‘", "'")
    return any(pattern in lowered for pattern in HEADING_PATTERNS)


def _is_heading_tag(node: object) -> bool:
    """A real heading (h1-h6), or a <p> that's nothing but a single bolded
    label (Greenhouse/CTE PH's "<p><strong>Qualifications:</strong></p>"
    style, used in place of real heading tags)."""
    if not isinstance(node, Tag):
        return False
    if node.name in ("h1", "h2", "h3", "h4", "h5", "h6"):
        return True
    if node.name == "p":
        strong = node.find(["strong", "b"])
        if strong is None:
            return False
        full_text = node.get_text(strip=True)
        strong_text = strong.get_text(strip=True)
        return bool(full_text) and full_text == strong_text and len(full_text) <= 100
    return False


def _leaf_bullets(container: Tag) -> list[str]:
    """Every <li> with no nested <ul>/<ol> — a list item holding actual
    bullet text, not just a label for a sub-list. This flattens nested
    lists (e.g. a "Technical Skills:" item that itself contains a bulleted
    sub-list) without also emitting the label as a near-duplicate bullet."""
    bullets = []
    for li in container.find_all("li"):
        if li.find(["ul", "ol"]) is not None:
            continue
        text = li.get_text(separator=" ", strip=True)
        if text:
            bullets.append(text)
    return bullets


def extract_from_html(raw_html: str) -> list[str]:
    """Greenhouse's content / Ashby's descriptionHtml: walk the document,
    and for every heading matching a requirements pattern, take the <li>
    bullets from the <ul>/<ol> siblings that follow it, up to the next
    heading (of either style)."""
    soup = BeautifulSoup(html.unescape(raw_html or ""), "lxml")
    bullets: list[str] = []
    for tag in soup.find_all(_is_heading_tag):
        if not _is_requirements_heading(tag.get_text(strip=True)):
            continue
        for sibling in tag.find_next_siblings():
            if _is_heading_tag(sibling):
                break
            if isinstance(sibling, Tag) and sibling.name in ("ul", "ol"):
                bullets.extend(_leaf_bullets(sibling))
    return bullets


def extract_from_lever_lists(lists: list[dict]) -> list[str]:
    """Lever posting.lists: [{"text": heading, "content": "<ul>...</ul>"}]."""
    bullets: list[str] = []
    for section in lists or []:
        if not _is_requirements_heading(section.get("text", "")):
            continue
        soup = BeautifulSoup(section.get("content", "") or "", "lxml")
        bullets.extend(_leaf_bullets(soup))
    return bullets


def extract_requirements(source: str, posting: dict) -> list[str]:
    if source == "greenhouse":
        return extract_from_html(posting.get("content", ""))
    if source == "lever":
        return extract_from_lever_lists(posting.get("lists", []))
    if source == "ashby":
        return extract_from_html(posting.get("descriptionHtml", ""))
    raise ValueError(f"unknown source: {source!r}")


def load_companies(path: Path) -> list[dict]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return data["board"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=date.today().isoformat())
    args = parser.parse_args()

    raw_dir = DATA_ROOT / args.date
    companies = load_companies(COMPANIES_PATH)

    total = 0
    with_requirements = 0
    by_source: dict[str, list[int]] = {}

    for board in companies:
        source, slug, company = board["source"], board["slug"], board["company"]
        path = raw_dir / f"{source}-{slug}.json"
        if not path.exists():
            logger.warning("%s (%s): no raw file for %s, skipping", company, source, args.date)
            continue

        body = json.loads(path.read_text(encoding="utf-8"))
        postings = list_postings(source, body)
        src_counts = by_source.setdefault(source, [0, 0])
        company_hits = 0
        for posting in postings:
            bullets = extract_requirements(source, posting)
            total += 1
            src_counts[0] += 1
            if bullets:
                with_requirements += 1
                company_hits += 1
                src_counts[1] += 1

        logger.info(
            "%s (%s): %d/%d posting(s) got at least one requirement", company, source, company_hits, len(postings)
        )

    if total:
        logger.info("Coverage overall: %d/%d (%.0f%%)", with_requirements, total, 100 * with_requirements / total)
        for source, (src_total, src_hits) in by_source.items():
            logger.info("Coverage %s: %d/%d (%.0f%%)", source, src_hits, src_total, 100 * src_hits / src_total)


if __name__ == "__main__":
    main()
