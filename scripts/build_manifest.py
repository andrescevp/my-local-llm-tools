#!/usr/bin/env python3
"""Generate skills/manifest.json from the skill folders in this repository.

The manifest is the registration metadata consumed by index.ts and checked by
scripts/validate.py. It is derived data: never edit it by hand.

Usage:
    python3 scripts/build_manifest.py [repo-root]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

FRONTMATTER = re.compile(r"\A---\n(.*?)\n---", re.S)
FOLDED = re.compile(r"^description:\s*>\s*$", re.M)


def parse_frontmatter(text: str) -> dict[str, str]:
    """Return name/description from a SKILL.md frontmatter block."""
    match = FRONTMATTER.match(text)
    if not match:
        return {}
    block = match.group(1)
    fields: dict[str, str] = {}
    for key in ("name", "description"):
        found = re.search(rf"^{key}:\s*(.*)$", block, re.M)
        if found:
            fields[key] = found.group(1).strip()
    folded = FOLDED.search(block)
    if folded:
        tail = block[folded.end():]
        lines = []
        for line in tail.splitlines():
            if line and not line[0].isspace():
                break
            lines.append(line.strip())
        fields["description"] = " ".join(part for part in lines if part)
    if "description" in fields:
        fields["description"] = " ".join(fields["description"].split())
    return fields


def collect(skills_dir: Path) -> list[dict[str, str]]:
    """Build manifest entries for every directory containing a SKILL.md."""
    entries: list[dict[str, str]] = []
    for path in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
        skill = path / "SKILL.md"
        if not skill.is_file():
            continue
        meta = parse_frontmatter(skill.read_text(encoding="utf-8"))
        entries.append(
            {
                "id": path.name,
                "name": meta.get("name") or path.name,
                "description": meta.get("description", ""),
            }
        )
    return entries


def build(root: Path) -> Path:
    """Write <root>/skills/manifest.json and return its path."""
    target = root / "skills" / "manifest.json"
    payload = {"skills": collect(root / "skills")}
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return target


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
    target = build(root.resolve())
    print(f"wrote {target} ({len(json.loads(target.read_text())['skills'])} skills)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
