#!/usr/bin/env python3
"""Helpers for the local llama.cpp server skill (stdlib only)."""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import socket
import urllib.error
import urllib.request
from typing import Any

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8080
DEFAULT_MODEL_DIRS = (
    pathlib.Path.home() / ".cache" / "llama.cpp",
    pathlib.Path.home() / "models",
    pathlib.Path.home() / "workspace" / "models",
    pathlib.Path.home() / "workspace" / "my-local-llms" / "extra_models",
)
STATE_ROOT = pathlib.Path(
    os.environ.get("XDG_STATE_HOME", pathlib.Path.home() / ".local" / "state")
) / "llamacpp-server"

BINARY_CANDIDATES = (
    pathlib.Path("/usr/bin/llama-server"),
    pathlib.Path("/usr/local/bin/llama-server"),
    pathlib.Path.home() / "llama.cpp" / "build" / "bin" / "llama-server",
    pathlib.Path.home() / "workspace" / "llama.cpp" / "build" / "bin" / "llama-server",
    pathlib.Path.home() / "workspace" / "llamacpp-aot" / "build" / "bin" / "llama-server",
)


class LlamaError(RuntimeError):
    """Raised for configuration, connection, and process errors."""


def human_size(num: float | int | None) -> str:
    if not num:
        return "-"
    value = float(num)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if value < 1024 or unit == "TiB":
            return f"{int(value)} B" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TiB"


def normalize_client_host(host: str) -> str:
    if host in ("0.0.0.0", "*"):
        return "127.0.0.1"
    if host == "::":
        return "::1"
    return host


def base_url(host: str, port: int) -> str:
    host = normalize_client_host(host)
    if ":" in host:
        return f"http://[{host}]:{port}"
    return f"http://{host}:{port}"


def find_binary(explicit: str | None = None) -> str | None:
    candidates = []
    if explicit:
        candidates.append(pathlib.Path(explicit).expanduser())
    env = os.environ.get("LLAMA_SERVER_BIN")
    if env:
        candidates.append(pathlib.Path(env).expanduser())
    found = shutil.which("llama-server")
    if found:
        candidates.append(pathlib.Path(found))
    candidates.extend(BINARY_CANDIDATES)
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def model_dirs(extra: list[str] | None = None) -> list[pathlib.Path]:
    raw = list(extra or [])
    env = os.environ.get("LLAMACPP_MODEL_DIRS", "")
    if env:
        raw.extend(part for part in env.split(os.pathsep) if part)
    raw.extend(str(path) for path in DEFAULT_MODEL_DIRS)
    seen: set[str] = set()
    result: list[pathlib.Path] = []
    for item in raw:
        path = pathlib.Path(item).expanduser()
        key = str(path)
        if key not in seen:
            seen.add(key)
            result.append(path)
    return result


def discover_models(dirs: list[pathlib.Path] | list[str]) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for raw in dirs:
        base = pathlib.Path(raw).expanduser()
        if not base.is_dir():
            continue
        for root, subdirs, files in os.walk(base):
            rel = pathlib.Path(root).relative_to(base)
            if len(rel.parts) >= 4:
                subdirs[:] = []
            for name in files:
                if not name.lower().endswith(".gguf"):
                    continue
                path = pathlib.Path(root) / name
                key = str(path.resolve())
                found[key] = {"path": key, "size": path.stat().st_size}
    return sorted(found.values(), key=lambda item: item["path"].lower())


def build_serve_command(
    binary: str,
    model: str,
    host: str,
    port: int,
    ctx: int,
    ngl: int,
    threads: int | None,
    alias: str | None,
    api_key: str | None,
    extra: list[str] | None = None,
) -> list[str]:
    cmd = [
        str(binary), "-m", str(model), "--host", host, "--port", str(port),
        "-c", str(ctx), "-ngl", str(ngl),
    ]
    if threads:
        cmd.extend(["-t", str(threads)])
    if alias:
        cmd.extend(["--alias", alias])
    if api_key:
        cmd.extend(["--api-key", api_key])
    cmd.extend(extra or [])
    return cmd


def state_path(port: int) -> pathlib.Path:
    return STATE_ROOT / f"server-{port}.json"


def write_state(port: int, state: dict[str, Any]) -> None:
    STATE_ROOT.mkdir(parents=True, exist_ok=True)
    state_path(port).write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def read_state(port: int) -> dict[str, Any] | None:
    try:
        data = json.loads(state_path(port).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def list_states() -> list[dict[str, Any]]:
    if not STATE_ROOT.is_dir():
        return []
    states = []
    for path in sorted(STATE_ROOT.glob("server-*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict):
            states.append(data)
    return states


def remove_state(port: int) -> None:
    state_path(port).unlink(missing_ok=True)


def pid_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, ValueError):
        return False


def proc_cmdline(pid: int | None) -> str:
    if not pid:
        return ""
    try:
        raw = pathlib.Path(f"/proc/{int(pid)}/cmdline").read_bytes()
    except OSError:
        return ""
    return raw.replace(b"\0", b" ").decode("utf-8", errors="replace").strip()


def is_managed(pid: int | None, port: int) -> bool:
    if not pid_alive(pid):
        return False
    line = proc_cmdline(pid)
    return "llama-server" in line and str(port) in line


def port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((normalize_client_host(host), int(port)), timeout=0.3):
            return True
    except OSError:
        return False


def health(host: str, port: int) -> tuple[int | None, str]:
    url = f"{base_url(host, port)}/health"
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, OSError) as exc:
        return None, str(exc)


def http_json(
    url: str,
    path: str = "",
    payload: dict[str, Any] | None = None,
    api_key: str | None = None,
    timeout: int = 120,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{url.rstrip('/')}{path}", data=data, headers=headers,
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise LlamaError(f"HTTP {exc.code}: {detail[:500]}") from exc
    except (urllib.error.URLError, OSError) as exc:
        raise LlamaError(f"Cannot reach {url}: {exc}") from exc
    try:
        return json.loads(body) if body else {}
    except json.JSONDecodeError as exc:
        raise LlamaError(f"Invalid JSON: {body[:300]}") from exc


def tail_log(path: str, lines: int = 60) -> str:
    try:
        content = pathlib.Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise LlamaError(f"Cannot read log {path}: {exc}") from exc
    return "".join(content.splitlines(keepends=True)[-lines:])
