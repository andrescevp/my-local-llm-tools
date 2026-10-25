#!/usr/bin/env python3
"""Static validator for the cheap-ai-winth-local-tools harness.

Usage:
    python3 scripts/validate.py [repo-root]
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

EXPECTED_SKILLS = [
    "autoskills",
    "comfyui-server",
    "create-agent",
    "create-skill",
    "image-analysis",
    "llamacpp-server",
    "ocr",
    "ollama-server",
    "speak",
]
NEW_SKILL_SCRIPTS = {
    "llamacpp-server": ["llamacpp_server.py", "llamacpp_commands.py", "server_lib.py"],
    "ollama-server": ["ollama_server.py", "ollama_commands.py", "ollama_client.py"],
}


def check(cond: bool, msg: str, errors: list[str], ok: list[str]) -> None:
    (ok if cond else errors).append(msg)


def load_json(path: Path, errors: list[str]) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{path}: invalid JSON: {exc}")
        return None


def frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---", text, re.S)
    if not match:
        return {}
    fields: dict[str, str] = {}
    current = ""
    for line in match.group(1).splitlines():
        if line[:1].isspace() and current:
            fields[current] = f"{fields[current]} {line.strip()}".strip()
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        current = key.strip()
        fields[current] = value.strip()
    description = fields.get("description", "")
    if description.startswith(">"):
        description = description[1:].strip()
    fields["description"] = " ".join(description.split())
    return fields


def validate(root: Path) -> int:
    errors: list[str] = []
    ok: list[str] = []
    root = root.resolve()
    skills_dir = root / "skills"

    # 1. Skill directories and SKILL.md frontmatter
    actual = sorted(path.name for path in skills_dir.iterdir() if path.is_dir()) if skills_dir.is_dir() else []
    check(actual == sorted(EXPECTED_SKILLS), f"skills/ contains exactly the {len(EXPECTED_SKILLS)} expected skills", errors, ok)
    for name in EXPECTED_SKILLS:
        skill = skills_dir / name / "SKILL.md"
        check(skill.is_file(), f"skills/{name}/SKILL.md present", errors, ok)
        if not skill.is_file():
            continue
        text = skill.read_text(encoding="utf-8")
        meta = frontmatter(text)
        check(meta.get("name") == name, f"skills/{name}/SKILL.md frontmatter name matches", errors, ok)
        check(bool(meta.get("description")), f"skills/{name}/SKILL.md has a description", errors, ok)
        check(len(text.splitlines()) <= 250, f"skills/{name}/SKILL.md <= 250 lines", errors, ok)

    # 2. Manifest
    manifest = load_json(skills_dir / "manifest.json", errors)
    if manifest is not None:
        entries = manifest.get("skills", [])
        ids = {entry.get("id") for entry in entries}
        check(ids == set(EXPECTED_SKILLS), f"skills/manifest.json covers all {len(EXPECTED_SKILLS)} skills", errors, ok)
        by_id = {entry.get("id"): entry for entry in entries}
        for name in EXPECTED_SKILLS:
            entry = by_id.get(name, {})
            check(entry.get("name") == name, f"manifest entry '{name}' has matching name", errors, ok)
            check(bool(entry.get("description")), f"manifest entry '{name}' has a description", errors, ok)
            skill_text = (skills_dir / name / "SKILL.md").read_text(encoding="utf-8")
            expected = frontmatter(skill_text).get("description", "")
            check(entry.get("description") == expected, f"manifest entry '{name}' description matches SKILL.md", errors, ok)

    # 3. Package + plugin entry
    pkg = load_json(root / "package.json", errors)
    if pkg is not None:
        check(pkg.get("name") == "cheap-ai-winth-local-tools", "package.json name matches", errors, ok)
        check(bool(pkg.get("version")), "package.json has version", errors, ok)
        check(pkg.get("type") == "module", "package.json is ESM (type: module)", errors, ok)
        check(pkg.get("exports", {}).get(".") == "./index.ts", "package.json exports '.' -> ./index.ts", errors, ok)
        check(bool(pkg.get("dependencies", {}).get("@opencode/plugin")), "package.json depends on @opencode/plugin", errors, ok)

    entry = root / "index.ts"
    check(entry.is_file(), "index.ts present", errors, ok)
    if entry.is_file():
        source = entry.read_text(encoding="utf-8")
        check('id: HARNESS_ID' in source or 'id: "cheap-ai-winth-local-tools"' in source, "index.ts uses the harness id", errors, ok)
        check("Plugin.define" in source, "index.ts uses Plugin.define", errors, ok)
        check("ctx.skill.transform" in source, "index.ts registers skills", errors, ok)
        check("ctx.session.hook" in source, "index.ts hooks sessions", errors, ok)
        check("## Cheap AI Local Tools" in source, "index.ts injects the context marker", errors, ok)
        check(len(source.splitlines()) <= 300, "index.ts <= 300 lines", errors, ok)

    # 4. Scripts and executables
    for script in ("install.sh", "test.sh", "build_manifest.py", "validate.py"):
        path = root / "scripts" / script
        check(path.is_file(), f"scripts/{script} present", errors, ok)
        check(path.is_file() and os.access(path, os.X_OK), f"scripts/{script} executable", errors, ok)
    for skill, scripts in NEW_SKILL_SCRIPTS.items():
        for script in scripts:
            path = skills_dir / skill / "scripts" / script
            check(path.is_file(), f"skills/{skill}/scripts/{script} present", errors, ok)
            check(path.is_file() and os.access(path, os.X_OK), f"skills/{skill}/scripts/{script} executable", errors, ok)
    for skill in EXPECTED_SKILLS:
        evals = skills_dir / skill / "evals"
        if evals.is_dir():
            check(any(evals.glob("test_*.py")), f"skills/{skill}/evals has tests", errors, ok)

    # 5. Portability + file size + shell syntax
    for path in sorted((skills_dir).rglob("*")):
        if not path.is_file() or path.suffix not in {".md", ".py", ".sh"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for name in EXPECTED_SKILLS:
            if re.search(rf"~/\.agents/skills/{re.escape(name)}/", text):
                errors.append(f"{path.relative_to(root)}: hard-coded ~/.agents path")
                break
        if path.suffix == ".py" and path.name != "comfy_client.py" and len(text.splitlines()) > 300:
            errors.append(f"{path.relative_to(root)}: Python file exceeds 300 lines")
    for path in list((root / "scripts").glob("*.sh")) + list((skills_dir).rglob("*.sh")):
        proc = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True, check=False)
        check(proc.returncode == 0, f"{path.relative_to(root)}: bash syntax OK", errors, ok)

    # 6. Repo docs
    check((root / "README.md").is_file(), "README.md present", errors, ok)
    check((root / "AGENTS.md").is_file(), "AGENTS.md present", errors, ok)

    print(f"Inspecting harness: {root}\n")
    print(f"  OK ({len(ok)}):")
    for line in ok:
        print(f"    ✓ {line}")
    if errors:
        print(f"\n  FAILED ({len(errors)}):")
        for line in errors:
            print(f"    ✗ {line}")
        return 1
    print("\n✅ VALIDATION SUCCESSFUL: harness is consistent.")
    return 0


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    raise SystemExit(validate(target))
