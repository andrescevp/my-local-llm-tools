# OpenAI endpoint catalog (spec v2.3.0)

Source: <https://raw.githubusercontent.com/openai/openai-openapi/refs/heads/main/openapi.yaml>
Base URL: `https://api.openai.com/v1`. Only the entries marked as compatible in
the main `SKILL.md` matrix are safe for local servers (llama.cpp, Ollama, vLLM).

## Core inference

| Method | Path | Use |
|---|---|---|
| GET | `/models` | List models available to the key/server |
| GET | `/models/{model}` | Model metadata |
| POST | `/chat/completions` | Chat/multimodal messages, tools, streaming |
| POST | `/completions` | Legacy text completion |
| POST | `/embeddings` | Embedding vectors |
| POST | `/responses` | Newer stateful response API (OpenAI-first) |
| POST | `/responses/input_tokens` | Token counting for Responses input |
| POST | `/responses/compact` | Compact a Responses conversation |

## Multimodal

| Method | Path | Use |
|---|---|---|
| POST | `/images/generations` | Text to image |
| POST | `/images/edits` | Edit an image |
| POST | `/images/variations` | Image variations |
| POST | `/audio/speech` | Text to speech |
| POST | `/audio/transcriptions` | Speech to text |
| POST | `/audio/translations` | Translate audio to English |
| POST | `/videos` | Video generation jobs |
| GET | `/videos/{video_id}/content` | Download generated video |

## Stateful, retrieval, and tools

| Method | Path | Use |
|---|---|---|
| POST | `/assistants`, `/threads`, `/threads/{id}/runs` | Assistants API |
| POST | `/vector_stores` | Managed vector stores |
| POST | `/vector_stores/{id}/search` | Vector search |
| POST | `/files`, `/uploads` | Upload files for tools/batches |
| POST | `/batches` | Batch jobs |
| POST | `/fine_tuning/jobs` | Fine-tuning jobs |
| POST | `/moderations` | Content moderation |
| POST | `/realtime/sessions` | Realtime WebRTC/WebSocket sessions |
| POST | `/evals` | Evaluation runs |

## Admin (not for inference clients)

`/organization/*` and `/projects/*` cover API keys, projects, groups, roles,
certificates, usage, costs, spend alerts, and audit logs. They require an
admin-scoped key and are never implemented by local OpenAI-compatible servers.

## Compatibility rule of thumb

1. `GET /models` — universal.
2. `POST /chat/completions` — universal (tools/vision vary by model).
3. `POST /embeddings` — common for local servers; confirm the model was pulled
   with embedding support.
4. Everything else — assume OpenAI-only until the server documents it.
