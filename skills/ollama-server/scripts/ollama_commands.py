#!/usr/bin/env python3
"""Command implementations for the local Ollama CLI."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
from typing import Any

from ollama_client import (
    OllamaError,
    build_chat_payload,
    build_generate_payload,
    human_size,
    normalize_url,
    request_json,
    stream_json,
    summarize_model,
)


def read_prompt(value: str | None) -> str:
    if value:
        return value
    if not sys.stdin.isatty():
        text = sys.stdin.read().strip()
        if text:
            return text
    raise OllamaError("no prompt provided (use --prompt or pipe text on stdin)")


def print_table(headers: list[str], rows: list[list[str]]) -> None:
    if not rows:
        print("(none)")
        return
    widths = [len(header) for header in headers]
    for row in rows:
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(str(cell)))
    print("  ".join(header.ljust(widths[i]) for i, header in enumerate(headers)))
    print("  ".join("-" * width for width in widths))
    for row in rows:
        print("  ".join(str(cell).ljust(widths[i]) for i, cell in enumerate(row)))


def print_model_text(content: Any, thinking: Any = None) -> None:
    content = str(content or "").strip()
    thinking = str(thinking or "").strip()
    if content:
        print(content)
    elif thinking:
        print(f"[thinking]\n{thinking}")


def service_state() -> str:
    try:
        proc = subprocess.run(
            ["systemctl", "is-active", "ollama"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        return proc.stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def cmd_status(args: argparse.Namespace) -> int:
    version = request_json(args.url, "/api/version", timeout=5)
    tags = request_json(args.url, "/api/tags", timeout=10)
    running = request_json(args.url, "/api/ps", timeout=10)
    state = service_state()
    if args.json:
        print(json.dumps({
            "endpoint": normalize_url(args.url),
            "version": version,
            "service": state,
            "models": tags.get("models", []),
            "running": running.get("models", []),
        }, ensure_ascii=False, indent=2))
        return 0
    print(f"Endpoint : {normalize_url(args.url)}")
    print(f"Version  : {version.get('version', '?')}")
    print(f"Service  : {state}")
    print(f"Models   : {len(tags.get('models', []))}")
    print(f"Loaded   : {len(running.get('models', []))}")
    for model in running.get("models", []):
        print(
            f"  - {model.get('name', '?')}  "
            f"{human_size(model.get('size'))} "
            f"(VRAM {human_size(model.get('size_vram'))})"
        )
    return 0


def cmd_models(args: argparse.Namespace) -> int:
    data = request_json(args.url, "/api/tags", timeout=15)
    rows = [summarize_model(model) for model in data.get("models", [])]
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    print_table(
        ["NAME", "SIZE", "FAMILY", "PARAMS", "QUANT", "CTX", "CAPS"],
        [[
            row["name"], human_size(row["size"]), str(row["family"]),
            str(row["params"]), str(row["quant"]), str(row["context"]),
            ",".join(row["capabilities"]),
        ] for row in rows],
    )
    return 0


def cmd_ps(args: argparse.Namespace) -> int:
    data = request_json(args.url, "/api/ps", timeout=10)
    if args.json:
        print(json.dumps(data.get("models", []), ensure_ascii=False, indent=2))
        return 0
    print_table(
        ["NAME", "SIZE", "VRAM", "EXPIRES"],
        [[
            model.get("name", "?"), human_size(model.get("size")),
            human_size(model.get("size_vram")), str(model.get("expires_at", "-")),
        ] for model in data.get("models", [])],
    )
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    data = request_json(args.url, "/api/show", "POST", {"model": args.model}, timeout=20)
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    details = data.get("details") or {}
    print(f"Model: {args.model}")
    print(f"Family: {details.get('family', '?')}")
    print(f"Capabilities: {', '.join(data.get('capabilities') or []) or '-'}")
    print(f"Parameters: {details.get('parameter_size', '?')}")
    print(f"Quantization: {details.get('quantization_level', '?')}")
    if data.get("modelfile"):
        print("\n--- Modelfile ---")
        print(str(data["modelfile"]).strip())
    return 0


def cmd_pull(args: argparse.Namespace) -> int:
    print(f"Pulling {args.model} (network access required)...")
    last = None
    for event in stream_json(args.url, "/api/pull", {"model": args.model, "stream": True}):
        if event.get("error"):
            raise OllamaError(str(event["error"]))
        status = event.get("status", "")
        if status and status != last:
            print(status)
            last = status
    print(f"Ready: {args.model}")
    return 0


def cmd_generate(args: argparse.Namespace) -> int:
    args.prompt = read_prompt(args.prompt)
    payload = build_generate_payload(args)
    data = request_json(args.url, "/api/generate", "POST", payload, timeout=args.timeout)
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print_model_text(data.get("response"), data.get("thinking"))
    return 0


def cmd_chat(args: argparse.Namespace) -> int:
    if args.prompt is None and not args.message:
        args.prompt = read_prompt(None)
    payload = build_chat_payload(args)
    data = request_json(args.url, "/api/chat", "POST", payload, timeout=args.timeout)
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        message = data.get("message") or {}
        print_model_text(message.get("content"), message.get("thinking"))
    return 0


def cmd_embed(args: argparse.Namespace) -> int:
    texts = list(args.text or [])
    if args.file:
        texts.append(pathlib.Path(args.file).expanduser().read_text(encoding="utf-8"))
    if not texts:
        texts = [read_prompt(None)]
    data = request_json(
        args.url, "/api/embed", "POST",
        {"model": args.model, "input": texts}, timeout=args.timeout,
    )
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    for index, vector in enumerate(data.get("embeddings", [])):
        print(f"input[{index}]: {len(vector)} dims; first 5: {vector[:5]}")
    return 0


def cmd_unload(args: argparse.Namespace) -> int:
    data = request_json(
        args.url, "/api/generate", "POST",
        {"model": args.model, "keep_alive": 0}, timeout=30,
    )
    print(f"Unload requested for {args.model}: {data.get('done', 'ok')}")
    return 0


def cmd_rm(args: argparse.Namespace) -> int:
    if not args.yes:
        raise OllamaError("refusing to delete a model without --yes")
    request_json(args.url, "/api/delete", "DELETE", {"model": args.model}, timeout=60)
    print(f"Deleted: {args.model}")
    return 0


def cmd_service(_: argparse.Namespace) -> int:
    state = service_state()
    print(f"Service: {state}")
    print("Start  : sudo systemctl start ollama")
    print("Stop   : sudo systemctl stop ollama")
    print("Status : systemctl status ollama --no-pager")
    print("Logs   : journalctl -u ollama -n 100 --no-pager")
    return 0 if state == "active" else 1
