#!/usr/bin/env bash
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyyaml>=6.0"]
# ///
"""Validate a SKILL.md file against the skill specification.

Usage: uv run scripts/validate_skill.py <path-to-SKILL.md>

Checks:
  - frontmatter starts at line 1, valid YAML, valid fields
  - name regex and directory match
  - description length + imperative trigger phrasing
  - body bans "## What I do" / "## When to use me" (info belongs in the description)
  - vague language
  - line count (warning over 200, error over 250)

Exit codes:
  0 - All checks passed (warnings allowed)
  1 - Validation failed (see error messages)
  2 - Usage error (missing argument, file not found)
"""

import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Error: pyyaml is required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(2)


def validate_name(name: str) -> list[str]:
    """Validate skill name against regex rules."""
    errors = []
    if not name:
        errors.append("name is empty")
        return errors
    if len(name) > 64:
        errors.append(f"name is {len(name)} chars (max 64)")
    if not re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', name):
        errors.append(f"name '{name}' does not match ^[a-z0-9]+(-[a-z0-9]+)*$")
    return errors


def validate_description(desc: str) -> list[str]:
    """Validate description field: length + imperative trigger phrasing."""
    errors = []
    if not desc:
        errors.append("description is empty")
        return errors
    if len(desc) > 500:
        errors.append(f"description is {len(desc)} chars (max 500)")
    if not any(phrase in desc.lower() for phrase in ["use this skill", "use this", "when"]):
        errors.append("description should use imperative phrasing with trigger contexts (e.g., 'Use this skill when...')")
    return errors


def validate_frontmatter(data: dict) -> list[str]:
    """Validate frontmatter fields."""
    errors = []
    required = ["name", "description"]
    for field in required:
        if field not in data:
            errors.append(f"missing required field: {field}")

    if "name" in data:
        errors.extend(validate_name(str(data["name"])))
    if "description" in data:
        errors.extend(validate_description(str(data["description"])))

    valid_fields = {"name", "description", "license", "compatibility", "allowed-tools", "metadata"}
    for key in data:
        if key not in valid_fields:
            errors.append(f"unknown frontmatter field: {key}")

    return errors


def validate_directory_structure(skill_path: Path, name: str) -> list[str]:
    """Validate that the file is in the correct directory structure."""
    errors = []
    if skill_path.name != "SKILL.md":
        errors.append(f"file must be named SKILL.md, got '{skill_path.name}'")

    parent = skill_path.parent
    if parent.name != name:
        errors.append(f"directory name '{parent.name}' does not match skill name '{name}'")

    grandparent = parent.parent
    if grandparent.name != "skills":
        errors.append(f"parent directory should be 'skills/', got '{grandparent.name}'")

    return errors


def validate_content(content: str) -> tuple[list[str], list[str]]:
    """Validate SKILL.md body content. Returns (errors, warnings)."""
    errors = []
    warnings = []

    # Banned sections: capability/trigger info belongs in the frontmatter description
    # Match actual headings at line start only — inline prose mentions are allowed.
    banned_sections = [
        (r"^## What I do\s*$", "## What I do"),
        (r"^## When to use me\s*$", "## When to use me"),
    ]
    for pattern, label in banned_sections:
        if re.search(pattern, content, re.MULTILINE):
            errors.append(
                f"banned section '{label}' present — remove it and compress the info into the frontmatter description"
            )

    # Check for vague language patterns
    vague_patterns = [
        r"handle errors appropriately",
        r"follow best practices",
        r"as appropriate",
        r"when necessary",
    ]
    for pattern in vague_patterns:
        if re.search(pattern, content, re.IGNORECASE):
            errors.append(f"vague language detected: '{pattern}' — be specific")

    # Check line count (target 200, hard cap 250)
    lines = content.split("\n")
    if len(lines) > 250:
        errors.append(f"skill is {len(lines)} lines (hard cap: 250) — move detail to references/")
    elif len(lines) > 200:
        warnings.append(f"skill is {len(lines)} lines (target: under 200) — consider moving detail to references/")

    return errors, warnings


def main():
    if len(sys.argv) < 2:
        print("Usage: uv run scripts/validate_skill.py <path-to-SKILL.md>", file=sys.stderr)
        sys.exit(2)

    skill_path = Path(sys.argv[1])
    if not skill_path.exists():
        print(f"Error: file not found: {skill_path}", file=sys.stderr)
        sys.exit(2)

    content = skill_path.read_text()
    all_errors = []

    # Parse frontmatter
    if not content.startswith("---"):
        all_errors.append("file must start with '---' (YAML frontmatter)")

    parts = content.split("---", 2)
    if len(parts) < 3:
        all_errors.append("invalid frontmatter: missing closing '---'")
        print(f"FAILED ({len(all_errors)} errors):")
        for err in all_errors:
            print(f"  ✗ {err}")
        sys.exit(1)

    try:
        data = yaml.safe_load(parts[1])
    except yaml.YAMLError as e:
        all_errors.append(f"invalid YAML in frontmatter: {e}")
        print(f"FAILED ({len(all_errors)} errors):")
        for err in all_errors:
            print(f"  ✗ {err}")
        sys.exit(1)

    # Validate frontmatter
    all_errors.extend(validate_frontmatter(data))

    # Validate directory structure
    if "name" in data:
        all_errors.extend(validate_directory_structure(skill_path, str(data["name"])))

    # Validate content (everything after frontmatter)
    body = parts[2] if len(parts) > 2 else ""
    content_errors, warnings = validate_content(body)
    all_errors.extend(content_errors)

    # Report results
    for warn in warnings:
        print(f"  ⚠ {warn}")
    if all_errors:
        print(f"FAILED ({len(all_errors)} errors):")
        for err in all_errors:
            print(f"  ✗ {err}")
        sys.exit(1)
    else:
        print("PASSED — all checks passed")
        sys.exit(0)


if __name__ == "__main__":
    main()