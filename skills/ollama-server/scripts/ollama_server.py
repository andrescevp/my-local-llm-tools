#!/usr/bin/env python3
"""Manage and query the local Ollama server.

Examples:
    python3 ollama_server.py status
    python3 ollama_server.py models
    python3 ollama_server.py generate minicpm-v4.6:latest --prompt "Describe this" \\
        --image /abs/shot.png
    python3 ollama_server.py chat qwen3:8b --prompt "Hola"
    python3 ollama_server.py unload minicpm-v4.6:latest
"""

from __future__ import annotations

import argparse
import sys

import ollama_commands as cmds
from ollama_client import DEFAULT_TIMEOUT, DEFAULT_URL, OllamaError, parse_message


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Local Ollama server CLI (status, models, generate, chat, embed).",
    )
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Ollama base URL (default: {DEFAULT_URL})")
    parser.add_argument("--json", action="store_true", help="print raw JSON")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="health, version, model counts").set_defaults(func=cmds.cmd_status)
    sub.add_parser("models", help="list installed models").set_defaults(func=cmds.cmd_models)
    sub.add_parser("ps", help="list loaded models").set_defaults(func=cmds.cmd_ps)
    sub.add_parser("service", help="systemd service state and hints").set_defaults(func=cmds.cmd_service)

    show = sub.add_parser("show", help="show model metadata")
    show.add_argument("model")
    show.set_defaults(func=cmds.cmd_show)

    pull = sub.add_parser("pull", help="download a model (network)")
    pull.add_argument("model")
    pull.set_defaults(func=cmds.cmd_pull)

    generate = sub.add_parser("generate", help="one-shot text/vision generation")
    generate.add_argument("model")
    generate.add_argument("-p", "--prompt")
    generate.add_argument("--system")
    generate.add_argument("--image", action="append", default=[])
    generate.add_argument("--format", choices=("json",), help="ask the model for JSON")
    generate.add_argument("--temperature", type=float)
    generate.add_argument("--num-ctx", type=int)
    generate.add_argument("--num-predict", type=int)
    generate.add_argument("--keep-alive")
    generate.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    generate.set_defaults(func=cmds.cmd_generate)

    chat = sub.add_parser("chat", help="one-shot chat completion")
    chat.add_argument("model")
    chat.add_argument("-p", "--prompt")
    chat.add_argument("--system")
    chat.add_argument("--message", action="append", type=parse_message, default=[])
    chat.add_argument("--image", action="append", default=[])
    chat.add_argument("--temperature", type=float)
    chat.add_argument("--num-ctx", type=int)
    chat.add_argument("--num-predict", type=int)
    chat.add_argument("--keep-alive")
    chat.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    chat.set_defaults(func=cmds.cmd_chat)

    embed = sub.add_parser("embed", help="text embeddings")
    embed.add_argument("model")
    embed.add_argument("--text", action="append", default=[])
    embed.add_argument("--file")
    embed.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    embed.set_defaults(func=cmds.cmd_embed)

    unload = sub.add_parser("unload", help="unload a model from memory")
    unload.add_argument("model")
    unload.set_defaults(func=cmds.cmd_unload)

    rm = sub.add_parser("rm", help="delete a model (requires --yes)")
    rm.add_argument("model")
    rm.add_argument("--yes", action="store_true")
    rm.set_defaults(func=cmds.cmd_rm)

    # Allow --url/--json before OR after the subcommand without clobbering
    # values parsed by the main parser (SUPPRESS keeps the existing default).
    for child in sub.choices.values():
        child.add_argument("--url", default=argparse.SUPPRESS, help=argparse.SUPPRESS)
        child.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args))
    except (OllamaError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
