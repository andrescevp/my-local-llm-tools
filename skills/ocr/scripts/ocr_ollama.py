#!/usr/bin/env python3
"""Local OCR extraction via Ollama vision model.

Default model: MedAIBase/PaddleOCR-VL:0.9b
Endpoint: http://127.0.0.1:11434/api/generate
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

DEFAULT_MODEL = "MedAIBase/PaddleOCR-VL:0.9b"
DEFAULT_OLLAMA = "http://127.0.0.1:11434"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract text from image(s) using local Ollama vision model."
    )
    parser.add_argument(
        "--image",
        action="append",
        required=True,
        help="Absolute path to input image. Repeat for multiple images.",
    )
    parser.add_argument(
        "--prompt",
        default=(
            "Extract all visible text from the provided image(s). "
            "Preserve structure and return concise markdown."
        ),
        help="Instruction prompt sent to model.",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Ollama model name (default: {DEFAULT_MODEL}).",
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
    return parser.parse_args()


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

    # markdown
    return response_text.strip()


def main() -> int:
    args = parse_args()
    try:
        paths = [pathlib.Path(p).expanduser().resolve() for p in args.image]
        encoded = [encode_image(path) for path in paths]
        result = call_ollama(
            ollama_url=args.ollama_url,
            model=args.model,
            prompt=args.prompt,
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
