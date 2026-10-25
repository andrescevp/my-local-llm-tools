---
name: comfyui-server
description: >
  Use this skill to generate video, image, music, and voice with the shared
  ComfyUI server (http://127.0.0.1:8188) and its 8 GB VRAM GGUF stack: LTX-Video
  2B (t2v + i2v), Flux.1-schnell (t2i), ACE-Step (music), Kokoro (TTS). Check
  server status, discover models/nodes/workflows in instance_facts.json,
  submit/track jobs, and fetch outputs. Trigger on "generate a
  video/image/music/voice with ComfyUI", "run the ltxv or flux workflow", "use
  the local comfy server", or "which comfyui workflows exist".
---

> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Run the CLI as `node "$SKILL_DIR/../../src/cli.mjs" comfy ...`.

# comfyui-server

Consume the **shared local ComfyUI server**. Everything is already installed and
configured: models, GGUF loaders, custom nodes, and five verified workflows. Read
`instance_facts.json` in this skill folder first — it is regenerated on every
sync and lists the exact models, nodes, workflows, versions, and service state.

## Instance rules (read before anything else)

- Base URL: `http://127.0.0.1:8188`. If the server is down, the owner installs it as
  the systemd **user service** `comfyui.service` (`systemctl --user status comfyui.service`).
  Do **not** spawn your own instance while a service or user instance is running —
  the port is single-owner. If it is fully down and you have been explicitly asked to
  operate the server, you may start it once with
  `~/ComfyUI/.venv/bin/python ~/ComfyUI/main.py --port 8188` and stop only your own process.
- Never kill a process you did not start. Never delete or download model files
  (~1–7 GiB each; the exact set is fixed for 8 GB VRAM — see facts: `models`).
- Outputs land in `~/ComfyUI/output/`. Generation is GPU-bound: plan ~1–5 min for
  video, ~40–90 s for images, 5–15 min for music.

## Quick start

```bash
comfy() { node "$SKILL_DIR/../../src/cli.mjs" comfy "$@"; }

comfy status                 # is it up? versions? queue?
comfy workflows              # what can I generate today?
comfy run /path/to/ltxv_t2v_8gb.json
comfy run /path/to/ltxv_t2v_8gb.json 20.seed=12345   # override a node param
comfy outputs                # generated files
comfy fetch ComfyUI_00001_.webm
```

The CLI reads workflow facts from `skills/comfyui-server/instance_facts.json` in
this repository. `comfyui-setup`'s `validate_workflow.py` remains an external
reference for the same conversion.

## Workflows available (filenames in facts: `workflows`)

| Workflow | Modal | Defaults |
|---|---|---|
| `ltxv_t2v_8gb.json` | video text→video | 768×512, 121 frames (~5 s), 8 steps LCM, CFG 1.0, seed 24, WEBM |
| `ltxv_i2v_8gb.json` | video image→video | same, first frame from `input/fox.jpg` (any image can be loaded), seed 42 |
| `t2i_flux_8gb.json` | image Flux.1-schnell | 1024², 4 steps, CFG 1.0, euler/simple |
| `tts_kokoro_8gb.json` | voice Kokoro (es) | Spanish via `ef_dora` voice; ONNX auto-downloaded on first use |
| `music_ace_step_8gb.json` | music ACE-Step | 30 s, 50 steps, CFG 5; `tags`=style, `lyrics`=text (empty = instrumental, accepts Spanish) |
| `llm_chat_8gb.json` | LLM → text | `OpenAICompatChat` → `SaveText`; calls the Jetson llama-server at `http://192.168.1.189:11434/v1` (gemma-4-E2B, reasoning model, no GPU) |
| `llm_flux_dev_8gb.json` | LLM → image | `OpenAICompatChat` → `CLIPTextEncode` → `FluxGuidance` → Flux dev 20 steps → PNG 1024² |
| `t2i_krea2_8gb.json` | image Krea 2 Turbo (realism cap.) | 1280×720, 8 steps `er_sde`, CFG 1.0; Qwen3-VL TE + Qwen-Image VAE; slow (RAM offload) |
| `t2i_sticky_8gb.json` | image sticky man | Z-Image Turbo + Sticky Man V2 LoRA; 1024², 8 steps |
| `t2i_sticky_frame_8gb.json` | sticky first-frame (16:9-ish) | 1216×832, wave/full-body composition for i2v |
| `ltxv_i2v_sticky_8gb.json` | sticky video clip (~5 s) | LTX i2v from `input/sticky_frame.png`; 768×512, 121 frames, 24 fps, VP9 |

Live copies: `~/ComfyUI/user/default/workflows/`. Backups: the comfyui-setup repo
(`backups/workflows/`). All five are API-format or frontend-format safe — the client
converts frontend JSON automatically.

## Generation conventions (8 GB VRAM — do not exceed)

- Video: **768×512, ≤121–161 frames, 8 steps, `lcm` sampler, CFG 1.0, fixed seed**.
  Rough VRAM rule: `width × height × frames` ≤ ~47M (768×512×121 ≈ 47.6M). Higher
  resolution ⇒ fewer frames. Output `SaveWEBM` (VP9).
- Fixed seed ⇒ deterministic output; set `noise_seed` on `SamplerCustom` for variety.
- Longer videos = chain segments: last frame of segment N becomes first frame of
  segment N+1 (same prompt/seed), concatenate with ffmpeg.
- Overrides example: `comfy run ltxv_t2v_8gb.json 20.noise_seed=7`
  (find the node id with `info SamplerCustom` / `info EmptyLTXVLatentVideo`).

## Node/model reference (canonical list in facts: `nodes` + `models`)

- GGUF loaders come from ComfyUI-GGUF: `UnetLoaderGGUF` (LTX Q5_K_M, Flux Q4_K_S),
  `CLIPLoaderGGUF` type `ltxv` (T5-XXL Q4_K_M), `DualCLIPLoaderGGUF` type `flux`
  (T5 GGUF + `clip_l.safetensors`).
- VT: `VAELoader` → `LTX-Video-0.9.6-VAE-BF16.safetensors` (2.3 GiB — normal) or
  Flux `ae.safetensors`.
- LTX video: `EmptyLTXVLatentVideo`, `LTXVImgToVideo` (requires `strength` widget,
  default 1.0), `LTXVConditioning`, `LTXVScheduler`, `SamplerCustom`, `SaveWEBM`.
- Flux: `CLIPTextEncodeFlux`, `EmptySD3LatentImage`, plus `ConditioningZeroOut`
  feeding the negative input of KSampler (required even with CFG 1.0).
- ACE-Step: native nodes only — `TextEncodeAceStepAudio`, `EmptyAceStepLatentAudio`,
  `LatentOperationTonemapReinhard`, `LatentApplyOperationCFG`.
- Kokoro: `KokoroGenerator`, `KokoroSpeaker`, `KokoroSpeakerCombiner` (custom node
  `comfyui-kokoro`).
- LLM (custom node `comfyui-openai-bridge`): `OpenAICompatChat` — any OpenAI-compatible
  `/v1` endpoint (Jetson llama-server `http://192.168.1.189:11434/v1` by default, model
  `gemma-4-E2B-it-abliterated.Q4_K_M.gguf`). Zero VRAM, stdlib only. Outputs `text` +
  `error` (errors also logged to the service). Reasoning models: keep `max_tokens` ≥ 512
  or `content` may be empty (the node falls back to `reasoning_content`).

## Gotchas (learned the hard way — trust these)

1. **API prompt keys are strings** (`"72"`, not `72`) — the client handles this.
2. **Booleans in the API are `"enable"`/`"disable"`** strings for combo fields; the
   frontend stores `true`/`false`. The client converts automatically.
3. `control_after_generate` is frontend-only meta — never send it to `/prompt`
   (the converter skips it and consumes its widget slot correctly).
4. The LTX text encoder is standard T5-XXL (vocab 32128) → the T5 GGUF is shared
   with Flux; there is no "long-caption" encoder on this box.
5. Deterministic: same seed ⇒ byte-identical output (confirmed). For variety, vary
   the seed, not the model.
6. Missing-model errors after adapting official workflows: official docs reference
   fp16 files this box does not have; adapt to GGUF loaders (the `comfyui-workflow-adapt`
   skill in the comfyui-setup repo covers this in detail).
7. Music (ACE-Step) is slow on 8 GB (5–15 min per track) — that is expected, not a bug.
8. Never `pkill` ComfyUI blindly. Check who owns the port first
   (`ss -ltnp 'sport = :8188'`); kill only your own ad-hoc process.

## Completion

Report: server state (up/down, service), prompt ids + final status, output file
name/size, and any overrides used. If you changed the setup (saved a workflow, added
a model, installed the service), run the sync so other agents see it:
`bash ~/workspace/comfyui-setup/scripts/distribute_skill.sh`.