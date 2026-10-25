---
name: openai-api-usage
description: >
  Use this skill when calling OpenAI or OpenAI-compatible APIs — OpenAI,
  llama.cpp, Ollama, vLLM, or LM Studio — covering base URLs, auth,
  chat/embeddings payloads, streaming, vision, tools, and error handling.
  Trigger on "call the OpenAI API", "/v1/chat/completions", "connect Ollama or
  llama.cpp through the OpenAI API", "which endpoints are compatible", or "why
  does this client fail against my local server?" — check the compatibility
  matrix first.
---

# OpenAI-compatible API usage

One request format works across OpenAI and local servers that implement the
OpenAI REST API. The **OpenAI OpenAPI spec** (v2.3.0) is the source of truth for
shapes; local servers implement a subset.

Spec: <https://github.com/openai/openai-openapi/blob/main/openapi.yaml> ·
Endpoint catalog: `references/endpoint-catalog.md`.

## Base URLs and auth

| Target | Base URL | Auth |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `Authorization: Bearer $OPENAI_API_KEY` |
| Ollama | `http://127.0.0.1:11434/v1` | ignored; send any non-empty placeholder |
| llama.cpp | `http://127.0.0.1:8080/v1` | Bearer only if started with `--api-key` |
| vLLM / LM Studio | server-specific `/v1` | usually Bearer or any placeholder |

```bash
export OPENAI_BASE_URL="https://api.openai.com/v1"   # or a local /v1 URL
export OPENAI_API_KEY="..."                          # from the environment only
```

Rules:

- Never hardcode, log, or commit keys; never print the `Authorization` header.
- The base URL must end in `/v1` when the client appends `/chat/completions`.
  Do not produce `/v1/v1/...`.
- Prefer localhost binds for local servers. Ollama ignores auth; llama.cpp only
  enforces it when `--api-key` was passed.
- Optional OpenAI scoping headers: `OpenAI-Organization`, `OpenAI-Project`.

## Minimal chat request

```bash
curl -sS "$OPENAI_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hola"}]
  }'
```

Use the exact model id the server reports (`GET /models`). Ollama names include
tags (`minicpm-v4.6:latest`); llama.cpp accepts the `--alias` or model path.

### Node.js (fetch)

```js
const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "")
const response = await fetch(`${base}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [{ role: "user", content: "Hola" }],
  }),
  signal: AbortSignal.timeout(120_000),
})
if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
const data = await response.json()
console.log(data.choices?.[0]?.message?.content ?? "")
```

## Endpoint compatibility

| Endpoint | OpenAI | Ollama `/v1` | llama.cpp `/v1` |
|---|---|---|---|
| `GET /models` | yes | yes | yes |
| `POST /chat/completions` | yes | yes | yes |
| `POST /completions` | yes (legacy) | yes (legacy) | yes |
| `POST /embeddings` | yes | yes | yes |
| `POST /responses` | yes | version-dependent | version-dependent |
| `POST /images/*`, `/audio/*`, `/moderations` | yes | no | no |
| Streaming (`"stream": true`) | yes | yes | yes |
| Tools / function calling | yes | version-dependent | model/template-dependent |
| Vision (`image_url`) | yes | yes | multimodal model + mmproj |
| `response_format` (JSON) | yes | model-dependent | model-dependent |

When unsure, probe the server: `GET /models` succeeds on every compatible
implementation; a missing endpoint returns `404`. `/v1/responses` is the newest
OpenAI surface and is **not** a safe common denominator — use
`/chat/completions` for portable clients.

## Common request shapes

```jsonc
// Embeddings
{"model": "text-embedding-3-small", "input": ["hola", "mundo"]}

// Text completion (legacy)
{"model": "local", "prompt": "Once upon a time", "max_tokens": 128}

// Vision (chat message content array)
{"model": "minicpm-v4.6:latest", "messages": [{"role": "user", "content": [
  {"type": "text", "text": "Describe this image"},
  {"type": "image_url", "image_url": {"url": "data:image/png;base64,...."}}
]}]}

// Tools
{"model": "gpt-4o-mini", "messages": [], "tools": [], "tool_choice": "auto"}
```

Response shapes:

- Chat: `choices[0].message.content` (some local reasoning models also return
  `reasoning_content`).
- Completion: `choices[0].text`.
- Embeddings: `data[i].embedding`.
- Errors: OpenAI uses `{"error": {"message", "type", "code"}}`; local servers
  may return plain text or a different schema — log status + body, not headers.

## Streaming

Set `"stream": true`; the server replies with Server-Sent Events:

```
data: {"choices":[{"delta":{"content":"Hola"}}]}
data: [DONE]
```

Parse line by line, ignore non-`data:` lines, stop at `[DONE]`, and tolerate
`delta.content` being absent on role/tool frames. Never `JSON.parse` the whole
body as one object.

## Model and parameter gotchas

- `max_tokens` is legacy on newer OpenAI reasoning models
  (`max_completion_tokens`); most local servers accept only `max_tokens`.
- Some OpenAI reasoning models reject `temperature`; omit it or use the
  model-specific controls.
- `response_format`, `tools`, `tool_choice`, and vision support vary by local
  model and server version — remove unsupported fields on `400`.
- Context limits are per model; truncated output usually means the context or
  output budget is too small.
- First call after a cold start loads weights (Ollama/llama.cpp): use a
  generous timeout (≥120 s) instead of retrying in a loop.
- OpenAI rate limits return `429` with `Retry-After`; local servers queue
  requests and may simply be slow.
- Ollama's native `/api/*` API exposes extra metadata (capabilities,
  `size_vram`); prefer `/v1` for portability and `/api/tags` only for probing.

## Security

- Read keys from env or a secret manager; never from command-line args that land
  in shell history or process lists.
- Do not send private images/text to OpenAI unless the user explicitly asks;
  local servers keep data on-machine.
- Local servers need no TLS on loopback; do not expose them publicly without
  auth and a reverse proxy.

## Validation checklist

- [ ] Base URL ends in `/v1` and is not doubled
- [ ] Model id verified with `GET /models`
- [ ] Auth header only where the server requires it
- [ ] Timeout covers cold-start weight loading
- [ ] Streaming parser handles SSE and `[DONE]`
- [ ] Unsupported fields removed for local targets
- [ ] Keys never logged, committed, or passed in process args

## Reference triggers

| Reference | When to use | File |
|---|---|---|
| Endpoint catalog | Looking up a specific OpenAI path or grouping (inference, audio, images, stateful, admin) | `references/endpoint-catalog.md` |
