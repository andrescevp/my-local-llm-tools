#!/usr/bin/env python3
"""Self-contained client for the shared ComfyUI server (stdlib only — no pip deps).

Works from any machine/directory that can reach the server. Talks to the ComfyUI
HTTP API: /system_stats, /object_info, /prompt, /history, /view.

Commands:
  status                  server health + versions + queue + output dir
  nodes [FILTER]          registered node types (substring filter)
  info NODE               required/optional inputs for one node type
  workflows [NAME]        known workflows (from instance_facts.json)
  submit WF [ID.k=v ...]  queue a workflow (frontend JSON or API prompt format)
                          pass node overrides like 10.seed=42 --check-only for no wait
  wait PID                poll /history until the prompt finishes
  run WF [ID.k=v ...]     submit + wait + print outputs
  outputs [DIR]           list generated files (default ~/ComfyUI/output)
  fetch FILE [--out P]    download an output file via /view into cwd (or --out);
                          FILE may include a subfolder prefix, e.g. audio/tts_00003.flac

Environment: COMFY_BASE (default http://127.0.0.1:8188), COMFY_OUTPUT (default ~/ComfyUI/output)
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

META_CONTROL = ("fixed", "randomize", "increment", "decrement")
BASE = os.environ.get("COMFY_BASE", "http://127.0.0.1:8188")
OUTDIR = os.environ.get("COMFY_OUTPUT", os.path.expanduser("~/ComfyUI/output"))


def get(path, timeout=30):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.load(r)


def post(path, data, timeout=60):
    req = urllib.request.Request(BASE + path, data=json.dumps(data).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def convert(wf, info):
    """Frontend workflow JSON -> API prompt (mirrors scripts/validate_workflow.py)."""
    prompt = {}
    links = {l[0]: l for l in wf.get("links", [])}
    for node in wf.get("nodes", []):
        if node.get("mode") in (2, 4):
            continue  # muted / bypassed
        ntype = node["type"]
        spec = info.get(ntype)
        if spec is None:
            print(f"WARN: node {ntype} not registered on the server", file=sys.stderr)
            continue
        widgets = list(node.get("widgets_values", []))
        sockets = {inp["name"]: inp for inp in node.get("inputs", [])}
        ins = {}
        wi = 0
        for section in ("required", "optional"):
            for name, pdef in spec["input"].get(section, {}).items():
                if name in ("control_after_generate", "upload"):
                    continue
                if name in sockets or wi >= len(widgets):
                    continue
                val = widgets[wi]
                wi += 1
                if val in META_CONTROL and not (isinstance(pdef, list) and pdef and val in pdef[0]):
                    if wi >= len(widgets):
                        continue
                    val = widgets[wi]
                    wi += 1
                if isinstance(val, bool) and isinstance(pdef, list) and pdef and isinstance(pdef[0], str):
                    val = "enable" if val else "disable"
                ins[name] = val
        for name, inp in sockets.items():
            link_id = inp.get("link")
            if link_id is None:
                continue
            src, src_idx = links[link_id][1], links[link_id][2]
            ins[name] = [str(src), src_idx]
        prompt[str(node["id"])] = {"class_type": ntype, "inputs": ins}
    return prompt


def load_prompt(path, info):
    with open(path, encoding="utf-8") as f:
        wf = json.load(f)
    if "nodes" in wf:
        return convert(wf, info)
    if "prompt" in wf:
        return wf["prompt"]
    return wf  # already API format


def to_value(s):
    for cast in (int, float):
        try:
            return cast(s)
        except ValueError:
            pass
    if s.lower() in ("true", "false"):
        return s.lower() == "true"
    return s


def apply_overrides(prompt, overrides):
    for ov in overrides:
        try:
            key, _, val = ov.partition("=")
            nid, _, param = key.partition(".")
            if not val or not param:
                raise ValueError
            prompt[nid]["inputs"][param] = to_value(val)
            print(f"override: node {nid} {param} = {prompt[nid]['inputs'][param]}")
        except (KeyError, ValueError):
            print(f"WARN: cannot apply override '{ov}' (expected NODE.PARAM=VALUE)",
                  file=sys.stderr)


def cmd_status(args):
    try:
        stats = get("/system_stats", timeout=5)
    except Exception as e:
        print(f"DOWN: {BASE} unreachable ({e}) — start it (see SKILL.md) or check the service")
        return 1
    s = stats.get("system", {})
    print(f"UP: {BASE}")
    print(f"  comfyui {s.get('comfyui_version', 'n/a')}  python {s.get('python_version', 'n/a')}  "
          f"torch {s.get('torch_version', 'n/a')}  cuda {s.get('cuda_version', 'n/a')}")
    devs = stats.get("devices") or []
    if devs:
        d0 = devs[0]
        print(f"  device: {d0.get('name', 'n/a')}  "
              f"vram_total {d0.get('vram_total', 0) / 2**30:.1f} GiB  "
              f"vram_free {d0.get('vram_free', 0) / 2**30:.1f} GiB")
    q = get("/queue")
    print(f"  queue: {len(q.get('queue_running', []))} running, {len(q.get('queue_pending', []))} pending")
    if os.path.isdir(OUTDIR):
        files = os.listdir(OUTDIR)
        print(f"  output dir {OUTDIR}: {len(files)} file(s)")
    return 0


def cmd_nodes(args):
    obj = get("/object_info")
    names = sorted(obj)
    if args.filter:
        names = [n for n in names if args.filter in n]
    print(f"{len(names)} node type(s)")
    for n in names:
        print(" ", n)


def cmd_info(args):
    obj = get("/object_info")
    spec = obj.get(args.node)
    if spec is None:
        print(f"node {args.node} NOT registered (see: nodes)", file=sys.stderr)
        return 1
    for section in ("required", "optional"):
        for name, pdef in spec["input"].get(section, {}).items():
            desc = pdef[0] if isinstance(pdef, list) else pdef
            if isinstance(desc, list):
                desc = desc[:8] + (["..."] if len(desc) > 8 else [])
            print(f"  [{section}] {name}: {desc}")
    return 0


def cmd_workflows(args):
    facts = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instance_facts.json")
    try:
        with open(facts, encoding="utf-8") as f:
            wf = json.load(f).get("workflows", [])
    except OSError:
        wf = []
    if not wf:
        print("no workflow facts found; run scripts/distribute_skill.sh in comfyui-setup")
        return 1
    for e in wf:
        print(f"  {e['name']}  ({e['size_bytes']} B)")
    return 0


def cmd_submit(args):
    obj = get("/object_info")
    prompt = load_prompt(args.workflow, obj)
    apply_overrides(prompt, args.override)
    for nid, n in prompt.items():
        print(f"  node {nid}: {n['class_type']}")
    try:
        resp = post("/prompt", {"prompt": prompt, "client_id": "comfyui-server-client"})
    except urllib.error.HTTPError as e:
        print(f"VALIDATION FAILED (HTTP {e.code}):\n{e.read().decode()[:4000]}")
        return 1
    pid = resp["prompt_id"]
    print(f"Prompt accepted: {pid}")
    if args.check_only:
        print("CHECK-ONLY: validation passed (prompt queued).")
    else:
        cmd_wait(argparse.Namespace(pid=pid, timeout_min=args.wait_min))
    return 0


def cmd_wait(args):
    deadline = time.time() + args.timeout_min * 60
    while time.time() < deadline:
        time.sleep(5)
        h = get("/history/" + args.pid)
        if args.pid in h:
            entry = h[args.pid]
            status = entry["status"]
            print(f"STATUS: {status['status_str']} completed={status.get('completed')}")
            for msg in status.get("messages", []):
                if msg[0] in ("execution_error", "execution_interrupted"):
                    print("ERROR:", json.dumps(msg[1])[:4000])
                    return 1
            for nid, out in entry.get("outputs", {}).items():
                for kind, items in out.items():
                    if kind in ("images", "gifs", "videos", "audio"):
                        print(f"OUTPUT node {nid} ({kind}):")
                        for it in items:
                            sub = it.get("subfolder", "")
                            name = it.get("filename")
                            print(f"  {sub + '/' if sub else ''}{name}")
            return 0
    print("TIMEOUT waiting for execution")
    return 1


def cmd_run(args):
    args.check_only = False
    args.wait_min = args.wait_min
    return cmd_submit(args)


def cmd_outputs(args):
    d = args.dir or OUTDIR
    if not os.path.isdir(d):
        print(f"no output dir at {d}", file=sys.stderr)
        return 1
    for name in sorted(os.listdir(d)):
        p = os.path.join(d, name)
        if os.path.isfile(p):
            print(f"  {name}  ({os.path.getsize(p)} B)")
    return 0


def cmd_fetch(args):
    # accept "subfolder/filename" paths (SaveAudio writes into an "audio" subfolder)
    subfolder, _, name = args.file.rpartition("/")
    url = (f"/view?filename={urllib.parse.quote(name)}&type=output"
           + (f"&subfolder={urllib.parse.quote(subfolder)}" if subfolder else ""))
    try:
        with urllib.request.urlopen(BASE + url, timeout=120) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        print(f"fetch failed (HTTP {e.code}): {e.read().decode()[:400]}")
        return 1
    out = args.out or name
    with open(out, "wb") as f:
        f.write(data)
    print(f"saved {out} ({len(data)} B)")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status", help="server health + versions").set_defaults(fn=cmd_status)
    p = sub.add_parser("nodes", help="registered node types")
    p.add_argument("filter", nargs="?")
    p.set_defaults(fn=cmd_nodes)
    p = sub.add_parser("info", help="inputs of one node type")
    p.add_argument("node")
    p.set_defaults(fn=cmd_info)
    p = sub.add_parser("workflows", help="known workflows")
    p.add_argument("name", nargs="?")
    p.set_defaults(fn=cmd_workflows)
    p = sub.add_parser("submit", help="queue a workflow (validates first)")
    p.add_argument("workflow")
    p.add_argument("override", nargs="*", help="NODE.PARAM=VALUE")
    p.add_argument("--check-only", action="store_true")
    p.add_argument("--wait-min", type=int, default=20)
    p.set_defaults(fn=cmd_submit)
    p = sub.add_parser("wait", help="wait for a prompt_id")
    p.add_argument("pid")
    p.add_argument("--timeout-min", type=int, default=20)
    p.set_defaults(fn=cmd_wait)
    p = sub.add_parser("run", help="submit + wait")
    p.add_argument("workflow")
    p.add_argument("override", nargs="*", help="NODE.PARAM=VALUE")
    p.add_argument("--wait-min", type=int, default=20)
    p.set_defaults(fn=cmd_run)
    p = sub.add_parser("outputs", help="list generated files")
    p.add_argument("--dir")
    p.set_defaults(fn=cmd_outputs)
    p = sub.add_parser("fetch", help="download an output file")
    p.add_argument("file")
    p.add_argument("--out")
    p.set_defaults(fn=cmd_fetch)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())