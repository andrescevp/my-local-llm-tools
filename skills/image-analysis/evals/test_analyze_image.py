#!/usr/bin/env python3
"""Unit tests for scripts/analyze_image.py — skill self-validation.

Run from the skill root:
    python3 evals/test_analyze_image.py
"""

import base64
import io
import json
import pathlib
import sys
import unittest
from unittest import mock

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import analyze_image  # noqa: E402


def make_png_bytes() -> bytes:
    """Minimal valid PNG (1x1 transparent) to satisfy mimetype checks."""
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
        "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )


class TestEncodeImage(unittest.TestCase):
    def test_requires_absolute_path(self):
        with self.assertRaises(ValueError):
            analyze_image.encode_image(pathlib.Path("relative.png"))

    def test_missing_file_raises(self):
        with self.assertRaises(ValueError):
            analyze_image.encode_image(pathlib.Path("/tmp/does-not-exist-xyz.png"))

    def test_rejects_non_image(self):
        p = pathlib.Path("/tmp/analyze-test-not-image.txt")
        p.write_text("hello", encoding="utf-8")
        try:
            with self.assertRaises(ValueError):
                analyze_image.encode_image(p)
        finally:
            p.unlink(missing_ok=True)

    def test_encodes_png(self):
        p = pathlib.Path("/tmp/analyze-test.png")
        p.write_bytes(make_png_bytes())
        try:
            out = analyze_image.encode_image(p)
            self.assertEqual(out, base64.b64encode(make_png_bytes()).decode())
        finally:
            p.unlink(missing_ok=True)


class TestCallOllama(unittest.TestCase):
    def test_builds_payload_with_images_and_temp_zero(self):
        captured = {}

        class FakeResp:
            def read(self):
                return json.dumps({"response": "ok"}).encode()

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def fake_urlopen(req, timeout):
            captured["url"] = req.full_url
            captured["body"] = json.loads(req.data)
            return FakeResp()

        with mock.patch("urllib.request.urlopen", side_effect=fake_urlopen):
            result = analyze_image.call_ollama(
                ollama_url="http://127.0.0.1:11434",
                model="minicpm-v4.6:latest",
                prompt="Describe",
                encoded_images=["AAAA"],
                timeout=30,
            )

        self.assertEqual(captured["url"], "http://127.0.0.1:11434/api/generate")
        self.assertEqual(captured["body"]["model"], "minicpm-v4.6:latest")
        self.assertEqual(captured["body"]["images"], ["AAAA"])
        self.assertEqual(captured["body"]["options"]["temperature"], 0)
        self.assertEqual(result["response"], "ok")


class TestVisionFallback(unittest.TestCase):
    def test_no_vision_error_flagged(self):
        err = RuntimeError(
            'Ollama HTTP 500: {"error":"image input is not supported'
            ' - hint: if this is unexpected, you may need to provide the mmproj"}'
        )
        self.assertTrue(analyze_image.is_vision_error(err))

    def test_other_error_not_flagged(self):
        err = RuntimeError("Ollama HTTP 404: model not found")
        self.assertFalse(analyze_image.is_vision_error(err))

    def test_fallback_to_minicpm_when_ocr_model_lacks_vision(self):
        with mock.patch.object(
            analyze_image,
            "call_ollama",
            side_effect=[
                analyze_image.VisionUnsupported(
                    "image input is not supported - mmproj missing"
                ),
                {"response": "fallback ok"},
            ],
        ) as m:
            out = analyze_image.run_with_fallback(
                ollama_url="http://127.0.0.1:11434",
                model="MedAIBase/PaddleOCR-VL:0.9b",
                prompt="Extract text",
                encoded_images=["AAAA"],
                timeout=30,
            )
        self.assertEqual(out, {"response": "fallback ok"})
        self.assertEqual(m.call_count, 2)
        self.assertEqual(m.call_args_list[1].kwargs["model"], analyze_image.DEFAULT_MODEL)

    def test_no_fallback_when_model_is_default(self):
        with mock.patch.object(
            analyze_image,
            "call_ollama",
            side_effect=[
                analyze_image.VisionUnsupported("mmproj missing"),
                {"response": "never"},
            ],
        ) as m:
            with self.assertRaises(analyze_image.VisionUnsupported):
                analyze_image.run_with_fallback(
                    ollama_url="http://127.0.0.1:11434",
                    model="minicpm-v4.6:latest",
                    prompt="p",
                    encoded_images=["AAAA"],
                    timeout=30,
                )
        self.assertEqual(m.call_count, 1)


class TestModeSelection(unittest.TestCase):
    def test_analyze_mode_for_minicpm(self):
        self.assertEqual(analyze_image.autodetect_mode("minicpm-v4.6:latest"), "analyze")

    def test_ocr_mode_for_paddle(self):
        self.assertEqual(
            analyze_image.autodetect_mode("MedAIBase/PaddleOCR-VL:0.9b"), "ocr"
        )

    def test_explicit_mode_wins(self):
        args = analyze_image.parse_args(
            ["--image", "/tmp/x.png", "--mode", "ocr", "--model", "minicpm-v4.6:latest"]
        )
        self.assertEqual(args.mode, "ocr")

    def test_default_mode_autodetect(self):
        args = analyze_image.parse_args(["--image", "/tmp/x.png"])
        self.assertEqual(args.mode, "auto")
        self.assertEqual(args.model, analyze_image.DEFAULT_MODEL)


class TestDefaultPrompts(unittest.TestCase):
    def test_analyze_prompt_mentions_content(self):
        self.assertIn("content", analyze_image.DEFAULT_ANALYZE_PROMPT.lower())

    def test_ocr_prompt_mentions_text(self):
        self.assertIn("text", analyze_image.DEFAULT_OCR_PROMPT.lower())


class TestFormatOutput(unittest.TestCase):
    def test_json_wraps_response(self):
        data = {"response": "hi", "model": "m", "done": True}
        out = json.loads(analyze_image.format_output(data, "json"))
        self.assertEqual(out["response"], "hi")
        self.assertEqual(out["model"], "m")

    def test_raw_returns_text(self):
        self.assertEqual(analyze_image.format_output({"response": "hi"}, "raw"), "hi")

    def test_markdown_strips(self):
        self.assertEqual(
            analyze_image.format_output(
                {"response": "  hello world\n"}, "markdown"
            ),
            "hello world",
        )


class TestMain(unittest.TestCase):
    def test_main_prints_response(self):
        with mock.patch.object(
            analyze_image, "call_ollama", return_value={"response": "cool image"}
        ) as m:
            with mock.patch.object(
                analyze_image, "encode_image", return_value="AAAA"
            ):
                buf = io.StringIO()
                with mock.patch("sys.stdout", buf):
                    rc = analyze_image.main(
                        ["--image", "/tmp/x.png", "--model", "minicpm-v4.6:latest"]
                    )
        self.assertEqual(rc, 0)
        self.assertIn("cool image", buf.getvalue())
        m.assert_called_once()

    def test_main_returns_error_code_on_failure(self):
        with mock.patch.object(analyze_image, "encode_image", side_effect=ValueError("no")):
            with mock.patch("sys.stderr", io.StringIO()):
                rc = analyze_image.main(["--image", "/tmp/x.png"])
        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)