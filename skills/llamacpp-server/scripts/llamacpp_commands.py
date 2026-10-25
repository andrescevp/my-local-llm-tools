#!/usr/bin/env python3
"""Command implementations for the local llama.cpp server CLI."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import time

import server_lib as sl


def parse_message(value: str) -> dict[str, str]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("message must use role=content")
    role, content = value.split("=", 1)
    if role not in ("system", "user", "assistant"):
        raise argparse.ArgumentTypeError("role must be system, user, or assistant")
    return {"role": role, "content": content}


def resolve_model(value: str, dirs: list[pathlib.Path]) -> pathlib.Path:
    path = pathlib.Path(value).expanduser()
    if path.is_file():
        return path.resolve()
    matches = [
        pathlib.Path(item["path"]) for item in sl.discover_models(dirs)
        if pathlib.Path(item["path"]).name.lower() == value.lower()
        or pathlib.Path(item["path"]).stem.lower() == value.lower()
    ]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise sl.LlamaError(f"ambiguous model '{value}': " + ", ".join(map(str, matches)))
    raise sl.LlamaError(f"model not found: {value} (use 'models' to list GGUF files)")


def cmd_doctor(args: argparse.Namespace) -> int:
    binary = sl.find_binary(args.binary)
    print(f"binary       : {binary or 'MISSING'}")
    if binary:
        try:
            proc = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=15, check=False)
            lines = (proc.stdout or proc.stderr).splitlines()
            print(f"version      : {lines[0] if lines else 'unknown'}")
        except (OSError, subprocess.SubprocessError) as exc:
            print(f"version      : unavailable ({exc})")
    if shutil.which("pacman"):
        package = subprocess.run(["pacman", "-Q", "llama-cpp"], capture_output=True, text=True, check=False)
        print(f"pacman       : {(package.stdout or 'not installed').strip()}")
    else:
        print("pacman       : unavailable")
    if shutil.which("nvidia-smi"):
        gpu = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader"],
            capture_output=True, text=True, check=False,
        )
        print(f"gpu          : {(gpu.stdout or 'nvidia-smi unavailable').strip()}")
    else:
        print("gpu          : nvidia-smi unavailable")
    for directory in sl.model_dirs(args.dir):
        print(f"models       : {directory} ({len(sl.discover_models([directory]))} gguf)")
    state = sl.read_state(sl.DEFAULT_PORT)
    print(f"port {sl.DEFAULT_PORT}    : {'managed pid ' + str(state.get('pid')) if state else 'free/unmanaged'}")
    if not binary:
        print("\nInstall with: sudo pacman -S llama-cpp   (or 'install' for source builds)")
        return 1
    return 0


def cmd_models(args: argparse.Namespace) -> int:
    dirs = sl.model_dirs(args.dir)
    models = sl.discover_models(dirs)
    if args.filter:
        needle = args.filter.lower()
        models = [model for model in models if needle in model["path"].lower()]
    if args.json:
        print(json.dumps(models, indent=2))
        return 0
    if not models:
        print("No .gguf files found. Searched:")
        for directory in dirs:
            print(f"  - {directory}")
        return 0
    for model in models:
        print(f"{sl.human_size(model['size']):>9}  {model['path']}")
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    binary = sl.find_binary(args.binary)
    if not binary:
        raise sl.LlamaError("llama-server not found (run 'doctor'; install with: sudo pacman -S llama-cpp)")
    model = resolve_model(args.model, sl.model_dirs(args.dir))
    state = sl.read_state(args.port)
    if state and sl.pid_alive(state.get("pid")):
        raise sl.LlamaError(f"a managed server is already running on port {args.port} (pid {state.get('pid')})")
    if state:
        sl.remove_state(args.port)
    if sl.port_open(args.host, args.port):
        raise sl.LlamaError(f"port {args.port} is already in use by an unmanaged process; choose another --port")

    extra = list(args.arg or [])
    if args.jinja:
        extra.append("--jinja")
    alias = args.alias or model.stem
    command = sl.build_serve_command(
        binary=binary, model=str(model), host=args.host, port=args.port,
        ctx=args.ctx, ngl=args.ngl, threads=args.threads, alias=alias,
        api_key=args.api_key, extra=extra,
    )
    sl.STATE_ROOT.mkdir(parents=True, exist_ok=True)
    log = sl.STATE_ROOT / f"server-{args.port}.log"
    with open(log, "ab") as handle:
        process = subprocess.Popen(
            command, stdout=handle, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True,
        )
    sl.write_state(args.port, {
        "pid": process.pid, "port": args.port, "host": args.host,
        "model": str(model), "alias": alias, "log": str(log),
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    })
    print(f"started pid={process.pid} port={args.port} model={model}")

    if args.no_wait:
        print(f"endpoint: {sl.base_url(args.host, args.port)}/v1")
        return 0
    deadline = time.monotonic() + args.wait
    while time.monotonic() < deadline:
        if not sl.pid_alive(process.pid):
            print("ERROR: llama-server exited during startup\n", file=sys.stderr)
            print(sl.tail_log(str(log), 30), file=sys.stderr)
            sl.remove_state(args.port)
            return 1
        status, _ = sl.health(args.host, args.port)
        if status == 200:
            print(f"health: ok ({sl.base_url(args.host, args.port)})")
            print(f"endpoint: {sl.base_url(args.host, args.port)}/v1")
            return 0
        time.sleep(0.5)
    print(f"still loading after {args.wait}s; check: llamacpp_server.py logs --port {args.port}")
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    ports = [state.get("port") for state in sl.list_states()] if args.all else [args.port]
    failed = 0
    for port in ports:
        if not port:
            continue
        state = sl.read_state(port)
        if not state:
            print(f"no managed server for port {port}")
            continue
        pid = state.get("pid")
        if not sl.pid_alive(pid):
            sl.remove_state(port)
            print(f"stale state removed for port {port}")
            continue
        if not sl.is_managed(pid, port):
            print(f"REFUSED: pid {pid} on port {port} is not a managed llama-server", file=sys.stderr)
            failed += 1
            continue
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + args.timeout
        while time.monotonic() < deadline and sl.pid_alive(pid):
            time.sleep(0.2)
        if sl.pid_alive(pid):
            if not args.force:
                print(f"pid {pid} did not exit; re-run with --force to SIGKILL", file=sys.stderr)
                failed += 1
                continue
            os.kill(pid, signal.SIGKILL)
        sl.remove_state(port)
        print(f"stopped port {port} (pid {pid})")
    return 1 if failed else 0


def cmd_status(args: argparse.Namespace) -> int:
    states = sl.list_states()
    if args.port:
        states = [state for state in states if state.get("port") == args.port]
    if args.json:
        print(json.dumps(states, indent=2))
        return 0
    if not states:
        print("No managed server. Start one with: llamacpp_server.py start <model.gguf>")
        return 0
    for state in states:
        code, _ = sl.health(state.get("host", sl.DEFAULT_HOST), state.get("port", sl.DEFAULT_PORT))
        alive = sl.pid_alive(state.get("pid"))
        print(f"port={state.get('port')} pid={state.get('pid')} alive={alive} health={code or 'down'}")
        print(f"  model   : {state.get('model')}")
        print(f"  endpoint: {sl.base_url(state.get('host', sl.DEFAULT_HOST), state.get('port', sl.DEFAULT_PORT))}/v1")
        print(f"  log     : {state.get('log')}")
    return 0


def cmd_logs(args: argparse.Namespace) -> int:
    state = sl.read_state(args.port)
    if not state:
        raise sl.LlamaError(f"no managed server for port {args.port}")
    print(sl.tail_log(state.get("log", ""), args.lines))
    return 0


def endpoint(args: argparse.Namespace) -> str:
    if args.url:
        return args.url.rstrip("/")
    state = sl.read_state(args.port) or {}
    return sl.base_url(state.get("host", sl.DEFAULT_HOST), state.get("port", args.port))


def model_name(args: argparse.Namespace) -> str:
    if args.model:
        return args.model
    state = sl.read_state(args.port) or {}
    return state.get("alias") or pathlib.Path(state.get("model", "local")).stem


def cmd_chat(args: argparse.Namespace) -> int:
    messages = [dict(message) for message in args.message]
    if args.system:
        messages.insert(0, {"role": "system", "content": args.system})
    messages.append({"role": "user", "content": args.prompt})
    payload = {
        "model": model_name(args), "messages": messages, "stream": False,
        "temperature": args.temperature, "max_tokens": args.max_tokens,
    }
    data = sl.http_json(endpoint(args), "/v1/chat/completions", payload, args.api_key, args.timeout)
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    message = ((data.get("choices") or [{}])[0].get("message") or {})
    print(str(message.get("content") or message.get("reasoning_content") or "").strip())
    return 0


def cmd_complete(args: argparse.Namespace) -> int:
    payload = {
        "model": model_name(args), "prompt": args.prompt, "stream": False,
        "temperature": args.temperature, "max_tokens": args.max_tokens,
    }
    data = sl.http_json(endpoint(args), "/v1/completions", payload, args.api_key, args.timeout)
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    print(str(((data.get("choices") or [{}])[0]).get("text", "")).strip())
    return 0


def cmd_install(_: argparse.Namespace) -> int:
    print("Arch/CachyOS package : sudo pacman -S llama-cpp")
    print("CUDA build (AUR)    : paru -S llama.cpp-cuda")
    print("From source         :")
    print("  git clone https://github.com/ggml-org/llama.cpp")
    print("  cmake -B llama.cpp/build -S llama.cpp -DGGML_CUDA=ON")
    print("  cmake --build llama.cpp/build -j")
    print("  export LLAMA_SERVER_BIN=$PWD/llama.cpp/build/bin/llama-server")
    return 0
