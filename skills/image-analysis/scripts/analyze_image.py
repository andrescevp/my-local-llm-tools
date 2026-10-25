#!/usr/bin/env python3
"""Local image analysis via Ollama vision models.

Default model:  minicpm-v4.6:latest          (general visual analysis)
OCR model:      MedAIBase/PaddleOCR-VL:0.9b  (text/structure extraction)
Endpoint:       http://127.0.0.1:11434/api/generate
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import pathlib
import sys
import urllib.error
import urllib.request

DEFAULT_MODEL = "minicpm-v4.6:latest"
OCR_MODEL = "MedAIBase/PaddleOCR-VL:0.9b"
DEFAULT_OLLAMA = "http://127.0.0.1:11434"

DEFAULT_ANALYZE_PROMPT = (
    "Analyze this image in detail. Describe its content, subjects, context, "
    "and any notable details. Be concise, structured, and objective."
)
DEFAULT_OCR_PROMPT = (
    "Extract all visible text from the provided image(s). "
    "Preserve structure and return concise markdown."
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze or OCR image(s) using a local Ollama vision model."
    )
    parser.add_argument(
        "--image",
        action="append",
        required=True,
        help="Absolute path to input image. Repeat for multiple images.",
    )
    parser.add_argument(
        "--prompt",
        default=None,
        help="Instruction prompt sent to model (defaults per mode).",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Ollama model name (default: {DEFAULT_MODEL}).",
    )
    parser.add_argument(
        "--mode",
        choices=("auto", "analyze", "ocr"),
        default="auto",
        help=(
            "auto: pick prompt by model (minicpm→analyze, PaddleOCR→ocr); "
            "analyze: general visual description; ocr: text extraction."
        ),
    )
    parser.add_argument(
        "--ollama-url",
        default=DEFAULT_OLLAMA,
        help=f"Ollama base URL (default: {DEFAULT_OLLAMA}).",
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "json", "raw"),
        default="markdown",
        help="Output format.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Request timeout in seconds.",
    )
    return parser.parse_args(argv)


def autodetect_mode(model: str) -> str:
    """Pick default mode from model name ('ocr' for PaddleOCR, else 'analyze')."""
    lowered = model.lower()
    if "paddleocr" in lowered or "ocr" in lowered:
        return "ocr"
    return "analyze"


def resolve_prompt(mode: str, prompt: str | None) -> str:
    if prompt:
        return prompt
    if autodetect_mode(DEFAULT_MODEL if mode == "auto" else mode) == "ocr":
        return DEFAULT_OCR_PROMPT
    return DEFAULT_ANALYZE_PROMPT


class VisionUnsupported(RuntimeError):
    """Raised when the model cannot accept image input (missing mmproj)."""


def is_vision_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "image input is not supported" in msg or "mmproj" in msg


def run_with_fallback(
    ollama_url: str,
    model: str,
    prompt: str,
    encoded_images: list[str],
    timeout: int,
) -> dict:
    """Call Ollama; if the model lacks vision support, retry with DEFAULT_MODEL."""
    try:
        return call_ollama(
            ollama_url=ollama_url,
            model=model,
            prompt=prompt,
            encoded_images=encoded_images,
            timeout=timeout,
        )
    except Exception as exc:  # noqa: BLE001
        if is_vision_error(exc) and model != DEFAULT_MODEL:
            print(
                f"WARN: model {model} lacks vision support (missing mmproj); "
                f"falling back to {DEFAULT_MODEL}",
                file=sys.stderr,
            )
            return call_ollama(
                ollama_url=ollama_url,
                model=DEFAULT_MODEL,
                prompt=prompt,
                encoded_images=encoded_images,
                timeout=timeout,
            )
        raise


def encode_image(path: pathlib.Path) -> str:
    if not path.is_absolute():
        raise ValueError(f"Image path must be absolute: {path}")
    if not path.exists() or not path.is_file():
        raise ValueError(f"Image not found: {path}")

    mime, _ = mimetypes.guess_type(path.name)
    if mime is not None and not mime.startswith("image/"):
        raise ValueError(f"File is not a recognized image: {path}")

    data = path.read_bytes()
    return base64.b64encode(data).decode("utf-8")


def call_ollama(
    ollama_url: str,
    model: str,
    prompt: str,
    encoded_images: list[str],
    timeout: int,
) -> dict:
    payload = {
        "model": model,
        "prompt": prompt,
        "images": encoded_images,
        "stream": False,
        "options": {
            "temperature": 0,
        },
    }

    req = urllib.request.Request(
        url=f"{ollama_url.rstrip('/')}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Ollama HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Cannot reach Ollama at {ollama_url}: {exc}") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON from Ollama: {raw[:500]}") from exc


def format_output(data: dict, fmt: str) -> str:
    response_text = data.get("response", "")
    if fmt == "raw":
        return response_text

    if fmt == "json":
        wrapped = {
            "model": data.get("model"),
            "done": data.get("done"),
            "response": response_text,
            "eval_count": data.get("eval_count"),
            "total_duration": data.get("total_duration"),
        }
        return json.dumps(wrapped, ensure_ascii=False, indent=2)

    return response_text.strip()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    mode = args.mode if args.mode != "auto" else autodetect_mode(args.model)
    prompt = resolve_prompt(mode, args.prompt)
    try:
        paths = [pathlib.Path(p).expanduser().resolve() for p in args.image]
        encoded = [encode_image(path) for path in paths]
        result = run_with_fallback(
            ollama_url=args.ollama_url,
            model=args.model,
            prompt=prompt,
            encoded_images=encoded,
            timeout=args.timeout,
        )
        print(format_output(result, args.format))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())