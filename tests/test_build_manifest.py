#!/usr/bin/env python3
"""Unit tests for scripts/build_manifest.py."""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_manifest as bm  # noqa: E402


class TestParseFrontmatter(unittest.TestCase):
    def test_folded_description_is_collapsed(self):
        text = (
            "---\n"
            "name: demo\n"
            "description: >\n"
            "  Use this skill when\n"
            "  doing demo things.\n"
            "license: MIT\n"
            "---\n\n# demo\n"
        )
        meta = bm.parse_frontmatter(text)
        self.assertEqual(meta["name"], "demo")
        self.assertEqual(meta["description"], "Use this skill when doing demo things.")

    def test_plain_description(self):
        text = "---\nname: demo\ndescription: Use this skill when testing.\n---\n"
        self.assertEqual(bm.parse_frontmatter(text)["description"], "Use this skill when testing.")

    def test_missing_frontmatter_returns_empty(self):
        self.assertEqual(bm.parse_frontmatter("# no frontmatter\n"), {})


class TestCollect(unittest.TestCase):
    def _write(self, root: pathlib.Path, name: str, body: str) -> None:
        skill = root / name / "SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text(body, encoding="utf-8")

    def test_collects_only_dirs_with_skill_md_sorted(self):
        with tempfile.TemporaryDirectory() as tmp:
            skills = pathlib.Path(tmp)
            self._write(
                skills,
                "beta",
                "---\nname: beta\ndescription: Use this skill when beta.\n---\n",
            )
            self._write(
                skills,
                "alpha",
                "---\nname: alpha\ndescription: Use this skill when alpha.\n---\n",
            )
            (skills / "empty").mkdir()
            entries = bm.collect(skills)
            self.assertEqual([e["id"] for e in entries], ["alpha", "beta"])
            self.assertEqual(entries[0]["name"], "alpha")
            self.assertEqual(entries[0]["description"], "Use this skill when alpha.")

    def test_name_falls_back_to_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            skills = pathlib.Path(tmp)
            self._write(skills, "no-name", "---\ndescription: Use this skill when x.\n---\n")
            self.assertEqual(bm.collect(skills)[0]["name"], "no-name")


class TestBuild(unittest.TestCase):
    def test_writes_manifest_with_trailing_newline(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            skill = root / "skills" / "demo" / "SKILL.md"
            skill.parent.mkdir(parents=True)
            skill.write_text(
                "---\nname: demo\ndescription: Use this skill when demo.\n---\n",
                encoding="utf-8",
            )
            out = bm.build(root)
            payload = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(payload["skills"][0]["id"], "demo")
            self.assertTrue(out.read_text(encoding="utf-8").endswith("\n"))


if __name__ == "__main__":
    unittest.main()
