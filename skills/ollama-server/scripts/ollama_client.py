#!/usr/bin/env python3
"""Shared Ollama client helpers (stdlib only).

All calls target a local Ollama instance; no telemetry or cloud fallback.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import pathlib
import urllib.error
import urllib.request
from typing import Any, Iterator

DEFAULT_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
DEFAULT_TIMEOUT = 120
ROLES = ("system", "user", "assistant", "tool")


class OllamaError(RuntimeError):
    """Raised for connection, HTTP, and payload errors."""


def normalize_url(url: str) -> str:
    return url.rstrip("/")


def human_size(num: float | int | None) -> str:
    if not num:
        return "-"
    value = float(num)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if value < 1024 or unit == "TiB":
            return f"{int(value)} B" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TiB"


def parse_message(value: str) -> dict[str, str]:
    if "=" not in value:
        raise ValueError("message must use role=content")
    role, content = value.split("=", 1)
    if role not in ROLES:
        raise ValueError(f"role must be one of: {', '.join(ROLES)}")
    return {"role": role, "content": content}


def summarize_model(raw: dict[str, Any]) -> dict[str, Any]:
    details = raw.get("details") or {}
    return {
        "name": raw.get("name", "?"),
        "size": raw.get("size"),
        "family": details.get("family", "-"),
        "params": details.get("parameter_size", "-"),
        "quant": details.get("quantization_level", "-"),
        "context": details.get("context_length", "-"),
        "capabilities": raw.get("capabilities") or [],
    }


def _request(
    url: str,
    path: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> urllib.request.Request:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    return urllib.request.Request(
        f"{normalize_url(url)}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )


def _open(req: urllib.request.Request, url: str, timeout: int):
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise OllamaError(f"HTTP {exc.code} for {req.full_url}: {detail[:500]}") from exc
    except (urllib.error.URLError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise OllamaError(
            f"Cannot reach Ollama at {normalize_url(url)} ({reason}). "
            "Start it with: sudo systemctl start ollama"
        ) from exc


def request_json(
    url: str,
    path: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    req = _request(url, path, method, payload, timeout)
    with _open(req, url, timeout) as resp:
        body = resp.read().decode("utf-8", errors="replace")
    try:
        return json.loads(body) if body else {}
    except json.JSONDecodeError as exc:
        raise OllamaError(f"Invalid JSON from Ollama: {body[:300]}") from exc


def stream_json(
    url: str,
    path: str,
    payload: dict[str, Any],
    timeout: int = 600,
) -> Iterator[dict[str, Any]]:
    req = _request(url, path, "POST", payload, timeout)
    with _open(req, url, timeout) as resp:
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                raise OllamaError(f"Invalid streaming JSON: {line[:300]}") from exc


def encode_images(paths: list[str] | None) -> list[str]:
    encoded: list[str] = []
    for raw in paths or []:
        path = pathlib.Path(raw).expanduser()
        if not path.is_absolute():
            raise OllamaError(f"Image path must be absolute: {raw}")
        if not path.is_file():
            raise OllamaError(f"Image not found: {path}")
        mime, _ = mimetypes.guess_type(path.name)
        if mime is not None and not mime.startswith("image/"):
            raise OllamaError(f"Not a recognized image: {path}")
        encoded.append(base64.b64encode(path.read_bytes()).decode("utf-8"))
    return encoded


def _options(args: Any) -> dict[str, Any]:
    options: dict[str, Any] = {}
    for key in ("temperature", "num_ctx", "num_predict"):
        value = getattr(args, key, None)
        if value is not None:
            options[key] = value
    return options


def build_generate_payload(args: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": args.model,
        "prompt": args.prompt,
        "stream": False,
    }
    options = _options(args)
    if options:
        payload["options"] = options
    if getattr(args, "system", None):
        payload["system"] = args.system
    images = encode_images(getattr(args, "image", None))
    if images:
        payload["images"] = images
    if getattr(args, "format", None):
        payload["format"] = args.format
    if getattr(args, "keep_alive", None) is not None:
        payload["keep_alive"] = args.keep_alive
    return payload


def build_chat_payload(args: Any) -> dict[str, Any]:
    messages: list[dict[str, Any]] = [
        dict(message) for message in (getattr(args, "message", None) or [])
    ]
    if getattr(args, "system", None):
        messages.insert(0, {"role": "system", "content": args.system})
    if getattr(args, "prompt", None):
        messages.append({"role": "user", "content": args.prompt})
    if not messages:
        raise OllamaError("provide --prompt or --message role=content")

    images = encode_images(getattr(args, "image", None))
    if images:
        for message in reversed(messages):
            if message.get("role") == "user":
                message["images"] = images
                break
        else:
            messages.append({"role": "user", "content": "", "images": images})

    payload: dict[str, Any] = {
        "model": args.model,
        "messages": messages,
        "stream": False,
    }
    options = _options(args)
    if options:
        payload["options"] = options
    if getattr(args, "keep_alive", None) is not None:
        payload["keep_alive"] = args.keep_alive
    return payload
