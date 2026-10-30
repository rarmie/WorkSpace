"""Phase 8 skill trends (docs/discovery-plan.md).

Requirement bullets are whole sentences ("3+ years of Python and SQL"), not
skills, so counting skills needs a vocabulary to match against. SKILLS maps a
display name to a regex. The list was picked from the words that actually
recur in the published bullets, not from a generic "top skills" list.

Matching rules:
- Case-insensitive, except "Go", which is also plain English (see _compile).
- A skill is matched as a whole token, so "java" does not match "javascript"
  and "sql" does not match "postgresql" (those are separate entries).
- A posting counts once per skill, however many bullets mention it.

To track a new skill, add a line to SKILLS. The next run recomputes every week
from scratch, so old weeks pick it up too.

    from pipeline.skills import skills_in
    skills_in(["3+ years of Python and SQL"])  # {"Python", "SQL"}
"""

from __future__ import annotations

import re

# name -> regex for the token itself (boundaries are added by _compile).
SKILLS: dict[str, str] = {
    # Languages
    "Python": r"python",
    "JavaScript": r"javascript|ecmascript",
    "TypeScript": r"typescript",
    "Go": r"",  # special-cased in _compile
    "Rust": r"rust",
    "Java": r"java",
    "C++": r"c\+\+",
    "C#": r"c#",
    "Ruby": r"ruby",
    "PHP": r"php",
    "Kotlin": r"kotlin",
    "Swift": r"swift",
    # Web
    "React": r"react(?:\.js|js)?",
    "Node.js": r"node(?:\.js|js)",
    "Next.js": r"next\.?js",
    "Django": r"django",
    "FastAPI": r"fastapi",
    "GraphQL": r"graphql",
    "REST": r"rest(?:ful)?\s+apis?",
    # Data
    "SQL": r"sql",
    "PostgreSQL": r"postgres(?:ql)?",
    "MySQL": r"mysql",
    "MongoDB": r"mongo(?:db)?",
    "Redis": r"redis",
    "Kafka": r"kafka",
    "Spark": r"spark",
    "Airflow": r"airflow",
    "dbt": r"dbt",
    # Cloud and infrastructure
    "AWS": r"aws|amazon web services",
    "GCP": r"gcp|google cloud",
    "Azure": r"azure",
    "Kubernetes": r"kubernetes|k8s",
    "Docker": r"docker",
    "Terraform": r"terraform",
    "Ansible": r"ansible",
    "CI/CD": r"ci/cd|continuous integration",
    "Linux": r"linux",
    "Ubuntu": r"ubuntu",
    "Git": r"git(?:hub|lab)?",
    "OpenStack": r"openstack",
    # AI
    "Machine learning": r"machine learning|ml",
    "PyTorch": r"pytorch",
    "TensorFlow": r"tensorflow",
    "LLMs": r"llms?|large language models?",
}

# A match must not touch another word character, "+" or "#", or "c++" would
# match inside "c++17" and "java" inside "javascript".
_BEFORE = r"(?<![\w+#])"
_AFTER = r"(?![\w+#])"


def _compile(name: str, pattern: str) -> re.Pattern[str]:
    # Go is the one case-sensitive skill, because "go" is ordinary English:
    # "golang" in any case, but "Go" only with a capital G that isn't the
    # first word of the bullet ("Go above and beyond").
    if name == "Go":
        return re.compile(rf"{_BEFORE}(?:(?i:golang)|(?<!^)Go(?! to\b| above\b| beyond\b)){_AFTER}")
    return re.compile(rf"{_BEFORE}(?:{pattern})" + _AFTER, re.IGNORECASE)


_COMPILED = {name: _compile(name, pattern) for name, pattern in SKILLS.items()}


def skills_in(bullets: list[str]) -> set[str]:
    """Every skill named in at least one of a posting's requirement bullets."""
    found: set[str] = set()
    for bullet in bullets:
        for name, regex in _COMPILED.items():
            if name not in found and regex.search(bullet):
                found.add(name)
    return found


if __name__ == "__main__":
    # Quick self-check: python -m pipeline.skills
    cases = {
        "3+ years of Python and SQL": {"Python", "SQL"},
        "Experience with JavaScript, not Java": {"JavaScript", "Java"},
        "We use PostgreSQL and C++17": {"PostgreSQL"},
        "Strong C++ or C# skills": {"C++", "C#"},
        "Go above and beyond for customers": set(),
        "Experience writing Go services": {"Go"},
        "Experience with golang": {"Go"},
        "Kubernetes (k8s) on AWS": {"Kubernetes", "AWS"},
        "Familiar with Node.js and React": {"Node.js", "React"},
        "Good communication": set(),
    }
    failed = 0
    for text, expected in cases.items():
        got = skills_in([text])
        ok = got == expected
        failed += not ok
        print("ok  " if ok else "FAIL", repr(text), sorted(got), "" if ok else f"expected {sorted(expected)}")
    raise SystemExit(1 if failed else 0)
