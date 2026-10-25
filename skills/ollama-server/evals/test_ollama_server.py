#!/usr/bin/env python3
"""Unit tests for the ollama-server skill CLIs.

Run from the skill root:
    python3 evals/test_ollama_server.py
"""

from __future__ import annotations

import base64
import pathlib
import sys
import tempfile
import unittest
from types import SimpleNamespace

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import ollama_client as oc  # noqa: E402

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


class TestHelpers(unittest.TestCase):
    def test_normalize_url_strips_trailing_slash(self):
        self.assertEqual(oc.normalize_url("http://127.0.0.1:11434/"), "http://127.0.0.1:11434")

    def test_human_size(self):
        self.assertEqual(oc.human_size(None), "-")
        self.assertEqual(oc.human_size(0), "-")
        self.assertEqual(oc.human_size(512), "512 B")
        self.assertEqual(oc.human_size(1024), "1.0 KiB")
        self.assertEqual(oc.human_size(1024**3), "1.0 GiB")

    def test_parse_message(self):
        self.assertEqual(
            oc.parse_message("user=hola"), {"role": "user", "content": "hola"}
        )
        self.assertEqual(
            oc.parse_message("user=a=b"), {"role": "user", "content": "a=b"}
        )
        with self.assertRaises(ValueError):
            oc.parse_message("no-equals")
        with self.assertRaises(ValueError):
            oc.parse_message("wizard=hello")

    def test_summarize_model(self):
        raw = {
            "name": "minicpm-v4.6:latest",
            "size": 1637848812,
            "details": {
                "family": "qwen35",
                "parameter_size": "752.16M",
                "quantization_level": "Q4_K_M",
                "context_length": 262144,
            },
            "capabilities": ["vision", "completion"],
        }
        row = oc.summarize_model(raw)
        self.assertEqual(row["name"], "minicpm-v4.6:latest")
        self.assertEqual(row["family"], "qwen35")
        self.assertEqual(row["quant"], "Q4_K_M")
        self.assertIn("vision", row["capabilities"])


class TestPayloads(unittest.TestCase):
    def test_generate_payload_encodes_image_and_options(self):
        with tempfile.TemporaryDirectory() as tmp:
            image = pathlib.Path(tmp) / "pixel.png"
            image.write_bytes(PNG_1PX)
            args = SimpleNamespace(
                model="minicpm-v4.6:latest",
                prompt="describe",
                system="be brief",
                image=[str(image)],
                temperature=0,
                num_ctx=2048,
                num_predict=64,
                format=None,
                keep_alive=None,
            )
            payload = oc.build_generate_payload(args)
        self.assertEqual(payload["model"], "minicpm-v4.6:latest")
        self.assertEqual(payload["system"], "be brief")
        self.assertEqual(payload["options"], {"temperature": 0, "num_ctx": 2048, "num_predict": 64})
        self.assertEqual(len(payload["images"]), 1)
        self.assertFalse(payload["stream"])

    def test_generate_payload_rejects_relative_image(self):
        args = SimpleNamespace(
            model="m",
            prompt="p",
            system=None,
            image=["relative.png"],
            temperature=None,
            num_ctx=None,
            num_predict=None,
            format=None,
            keep_alive=None,
        )
        with self.assertRaises(oc.OllamaError):
            oc.build_generate_payload(args)

    def test_chat_payload_attaches_images_to_last_user_message(self):
        with tempfile.TemporaryDirectory() as tmp:
            image = pathlib.Path(tmp) / "pixel.png"
            image.write_bytes(PNG_1PX)
            args = SimpleNamespace(
                model="m",
                prompt="what is this?",
                system="be brief",
                message=[{"role": "user", "content": "first"}],
                image=[str(image)],
                temperature=None,
                num_ctx=None,
                num_predict=None,
                keep_alive=None,
            )
            payload = oc.build_chat_payload(args)
        self.assertEqual(payload["messages"][0]["role"], "system")
        self.assertEqual(payload["messages"][-1]["content"], "what is this?")
        self.assertIn("images", payload["messages"][-1])

    def test_chat_payload_requires_messages(self):
        args = SimpleNamespace(
            model="m",
            prompt=None,
            system=None,
            message=[],
            image=[],
            temperature=None,
            num_ctx=None,
            num_predict=None,
            keep_alive=None,
        )
        with self.assertRaises(oc.OllamaError):
            oc.build_chat_payload(args)


if __name__ == "__main__":
    unittest.main()
