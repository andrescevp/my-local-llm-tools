#!/usr/bin/env python3
"""Run and query a local llama.cpp HTTP server (llama-server).

The server is managed only when started by this CLI: its PID, port, and log
are recorded under the user state directory. Unknown processes are never killed.
"""

from __future__ import annotations

import argparse
import os
import sys

import llamacpp_commands as cmds
import server_lib as sl


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage a local llama.cpp HTTP server.")
    parser.add_argument("--json", action="store_true", help="print raw JSON where supported")
    sub = parser.add_subparsers(dest="command", required=True)

    doctor = sub.add_parser("doctor", help="check binary, GPU, model dirs, port")
    doctor.add_argument("--binary")
    doctor.add_argument("--dir", action="append", default=[])
    doctor.set_defaults(func=cmds.cmd_doctor)

    models = sub.add_parser("models", help="list local .gguf files")
    models.add_argument("--dir", action="append", default=[])
    models.add_argument("--filter")
    models.set_defaults(func=cmds.cmd_models)

    start = sub.add_parser("start", help="start a managed llama-server")
    start.add_argument("model")
    start.add_argument("--binary")
    start.add_argument("--dir", action="append", default=[])
    start.add_argument("--host", default=sl.DEFAULT_HOST)
    start.add_argument("--port", type=int, default=sl.DEFAULT_PORT)
    start.add_argument("--ctx", type=int, default=4096)
    start.add_argument("--ngl", type=int, default=99)
    start.add_argument("--threads", type=int)
    start.add_argument("--alias")
    start.add_argument("--api-key")
    start.add_argument("--jinja", action="store_true", help="use the model chat template")
    start.add_argument("--arg", action="append", default=[], help="extra llama-server flag")
    start.add_argument("--wait", type=int, default=90, help="seconds to wait for /health")
    start.add_argument("--no-wait", action="store_true")
    start.set_defaults(func=cmds.cmd_start)

    stop = sub.add_parser("stop", help="stop a managed server (never unknown PIDs)")
    stop.add_argument("--port", type=int, default=sl.DEFAULT_PORT)
    stop.add_argument("--all", action="store_true")
    stop.add_argument("--force", action="store_true", help="SIGKILL after timeout")
    stop.add_argument("--timeout", type=int, default=10)
    stop.set_defaults(func=cmds.cmd_stop)

    status = sub.add_parser("status", help="show managed servers and health")
    status.add_argument("--port", type=int)
    status.set_defaults(func=cmds.cmd_status)

    logs = sub.add_parser("logs", help="tail the managed server log")
    logs.add_argument("--port", type=int, default=sl.DEFAULT_PORT)
    logs.add_argument("-n", "--lines", type=int, default=60)
    logs.set_defaults(func=cmds.cmd_logs)

    chat = sub.add_parser("chat", help="OpenAI-compatible chat completion")
    chat.add_argument("--prompt", required=True)
    chat.add_argument("--model")
    chat.add_argument("--system")
    chat.add_argument("--message", action="append", type=cmds.parse_message, default=[])
    chat.add_argument("--url")
    chat.add_argument("--port", type=int, default=sl.DEFAULT_PORT)
    chat.add_argument("--api-key", default=os.environ.get("LLAMACPP_API_KEY"))
    chat.add_argument("--temperature", type=float, default=0.7)
    chat.add_argument("--max-tokens", type=int, default=512)
    chat.add_argument("--timeout", type=int, default=180)
    chat.set_defaults(func=cmds.cmd_chat)

    complete = sub.add_parser("complete", help="OpenAI-compatible text completion")
    complete.add_argument("--prompt", required=True)
    complete.add_argument("--model")
    complete.add_argument("--url")
    complete.add_argument("--port", type=int, default=sl.DEFAULT_PORT)
    complete.add_argument("--api-key", default=os.environ.get("LLAMACPP_API_KEY"))
    complete.add_argument("--temperature", type=float, default=0.7)
    complete.add_argument("--max-tokens", type=int, default=512)
    complete.add_argument("--timeout", type=int, default=180)
    complete.set_defaults(func=cmds.cmd_complete)

    install = sub.add_parser("install", help="show install options")
    install.set_defaults(func=cmds.cmd_install)

    for child in sub.choices.values():
        child.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args))
    except (sl.LlamaError, OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
