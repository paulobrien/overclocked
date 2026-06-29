---
sidebar_position: 4
---

# The Worker (Agent Backend)

`worker/index.ts` — a Cloudflare Worker that is the **only** thing holding API
keys. The browser never talks to Cerebras/OpenRouter/Gemini directly; every
model call goes through here.

## Responsibilities

1. **Inject API keys** from Worker secrets — never shipped to the browser.
2. **Resolve the provider → an AI SDK model** (Cerebras/OpenRouter/NVIDIA NIM via
   `@ai-sdk/openai-compatible`, Gemini via `@ai-sdk/google`). OpenRouter and NVIDIA
   are interchangeable GPU-hosted challengers, selectable per-run from the lobby.
3. **Run `streamObject` + Zod** so the model emits *schema-validated* JSON while
   still streaming — preserving the live tokens/sec speedometer.
4. **Re-wrap the JSON deltas as OpenAI-shaped SSE** so the client streaming code
   works unchanged.

One symmetric code path for all three providers = a fair race.

## Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | liveness probe |
| `/api/config` | GET | which providers are wired (readiness booleans + model ids + a `placeholder` flag per provider — **never keys**) |
| `/api/chat` | POST | run one agent step via `streamObject`, stream back as SSE |

## How `/api/chat` works

The request body carries the schema identity:

```json
{ "provider": "gemini", "role": "worker", "taskTypeId": "label-parse",
  "messages": [...], "temperature": 0.2, "max_tokens": 512 }
```

The Worker:

1. **Validates `provider`** (`cerebras` | `openrouter` | `nvidia` | `gemini`) and `role`.
2. **Validates `messages`** against a Zod schema — roles constrained to
   `system|user`, and `image_url.url` must be a `data:` URL or an allowlisted
   asset host. (This closes the SSRF vector where the provider would fetch an
   arbitrary URL server-side.)
3. **Resolves the schema** by `(role, taskTypeId)` — workers key off the task
   id; router/checker/escalation have fixed schemas.
4. **Builds the model** via `buildModel(env, provider, modelOverride)`.
5. **Transforms the messages** with `toModelMessages()` — the system prompt is
   lifted out of the array and passed via the `system` option (the AI SDK rejects
   a `role:'system'` message), and OpenAI-style `{type:'image_url'}` parts are
   converted to the SDK's `{type:'image', image}` shape. Without this every live
   call fails prompt standardization.
6. **Calls `streamObject({ model, schema, system, messages, temperature, maxOutputTokens })`**
   and pipes its `textStream` through `wrapStreamAsSse()`, which emits
   `data: {choices:[{delta:{content}}]}` frames + `data: [DONE]`.

`temperature` is clamped to `[0,2]` and `max_tokens` (default 512) to `[1,8192]`
as `maxOutputTokens`.

## Why SSE re-wrapping

The AI SDK's `streamObject` yields partial JSON text deltas. The client
(`src/agents/streaming.ts`) parses OpenAI-shaped SSE. So the Worker re-wraps each
delta as an OpenAI `delta.content` frame — the client reconstructs the full JSON
and parses it. Because `streamObject` emits schema-valid JSON, the assembled
string parses cleanly.

## Security posture

- **Keys are server-only.** `/api/config` returns readiness booleans, never
  secrets. The test suite asserts no key material appears in the response.
- **Errors never leak.** All error paths log detail server-side and return a
  stable code (`upstream_error` / `provider_not_configured`). AI-SDK errors can
  embed request URLs / echoed auth, so `String(err)` is never sent to the client.
- **`APP_TOKEN`** is a weak public-proxy gate (it ships in the client bundle when
  set, so it's publicly recoverable). Real protection = provider spend caps +
  Cloudflare rate-limiting. See [Security](../ops/security).
- **No `dangerouslySetInnerHTML`** anywhere; model output is React-escaped text.

See [Providers](../extending/providers) for adding a new model provider.
