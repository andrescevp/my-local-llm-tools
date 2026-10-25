#!/usr/bin/env python3
"""Unit tests for the llamacpp-server skill library.

Run from the skill root:
    python3 evals/test_llamacpp_server.py
"""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import server_lib as sl  # noqa: E402


class TestHelpers(unittest.TestCase):
    def test_human_size(self):
        self.assertEqual(sl.human_size(0), "-")
        self.assertEqual(sl.human_size(1024), "1.0 KiB")
        self.assertEqual(sl.human_size(5 * 1024**3), "5.0 GiB")

    def test_normalize_client_host(self):
        self.assertEqual(sl.normalize_client_host("0.0.0.0"), "127.0.0.1")
        self.assertEqual(sl.normalize_client_host("::"), "::1")
        self.assertEqual(sl.normalize_client_host("192.168.1.5"), "192.168.1.5")

    def test_base_url(self):
        self.assertEqual(sl.base_url("127.0.0.1", 8080), "http://127.0.0.1:8080")
        self.assertEqual(sl.base_url("::1", 8080), "http://[::1]:8080")

    def test_build_serve_command(self):
        cmd = sl.build_serve_command(
            binary="/usr/bin/llama-server",
            model="/models/qwen.gguf",
            host="127.0.0.1",
            port=8080,
            ctx=4096,
            ngl=99,
            threads=8,
            alias="qwen",
            api_key="secret",
            extra=["--jinja"],
        )
        self.assertEqual(cmd[:3], ["/usr/bin/llama-server", "-m", "/models/qwen.gguf"])
        self.assertIn("--port", cmd)
        self.assertEqual(cmd[cmd.index("--port") + 1], "8080")
        self.assertEqual(cmd[cmd.index("-ngl") + 1], "99")
        self.assertEqual(cmd[cmd.index("-t") + 1], "8")
        self.assertEqual(cmd[cmd.index("--alias") + 1], "qwen")
        self.assertEqual(cmd[cmd.index("--api-key") + 1], "secret")
        self.assertEqual(cmd[-1], "--jinja")


class TestModels(unittest.TestCase):
    def test_discover_models_is_recursive_and_deduplicated(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "nested").mkdir()
            (root / "a.gguf").write_bytes(b"x" * 16)
            (root / "nested" / "b.GGUF").write_bytes(b"x" * 32)
            (root / "ignore.txt").write_text("nope")
            found = sl.discover_models([root, root])
        names = sorted(pathlib.Path(item["path"]).name for item in found)
        self.assertEqual(names, ["a.gguf", "b.GGUF"])

    def test_discover_models_ignores_missing_dirs(self):
        self.assertEqual(sl.discover_models(["/definitely/not/here"]), [])


class TestState(unittest.TestCase):
    def test_state_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(sl, "STATE_ROOT", pathlib.Path(tmp)):
                state = {"pid": 1234, "port": 8080, "model": "/m/x.gguf"}
                sl.write_state(8080, state)
                self.assertEqual(sl.read_state(8080), state)
                self.assertEqual([s["port"] for s in sl.list_states()], [8080])
                sl.remove_state(8080)
                self.assertIsNone(sl.read_state(8080))

    def test_list_states_survives_corrupt_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(sl, "STATE_ROOT", pathlib.Path(tmp)):
                (pathlib.Path(tmp) / "server-8080.json").write_text("{broken")
                self.assertEqual(sl.list_states(), [])


if __name__ == "__main__":
    unittest.main()
