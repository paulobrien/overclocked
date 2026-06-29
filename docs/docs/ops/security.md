---
sidebar_position: 3
---

# Security

This is the canonical security reference for the project. The trust model is
deliberate, not accidental.

## Trust model

- **The browser never holds API keys.** Every model call goes through the
  Cloudflare Worker, which injects keys from Worker secrets. The client only
  talks to `/api/*` on our origin. `/api/config` returns **readiness booleans +
  base URLs + model ids only** — keys never round-trip (tested).
- **Secrets are not committed.** `.gitignore` covers `.dev.vars`, `.env`,
  `.env.local`, `.env.*.local`. The `.example` files contain placeholders only.
- **No XSS surface.** Zero `dangerouslySetInnerHTML` / `innerHTML` in `src`. All
  model output renders through React's escaped text interpolation or
  `JSON.stringify` — including the SSE stream, which is `JSON.parse`d.

## Request handling & isolation

- **Errors never leak.** Every error path logs detail server-side and returns a
  stable code (`upstream_error` / `provider_not_configured`). Raw SDK errors —
  which can embed request URLs or echoed auth — are never sent to the client.
- **Request body is validated (SSRF guard).** `messages` are checked by a Zod
  schema: roles are constrained to `system|user`, `image_url.url` is allowlisted
  to `data:` URLs or our asset hosts (so the provider can't be made to fetch an
  arbitrary server-side URL), `temperature` is clamped to `[0,2]`, and
  `max_tokens` is clamped to `[1,8192]` so per-call output length is bounded.
- **Concurrency-safe engine.** `end()` is idempotent (no double `onEnd`), and
  `processLane` re-checks `running` after its model-call await before mutating
  state.

## Accepted / residual risks

These are documented, not oversights:

### `APP_TOKEN` is a weak gate
It ships in the client bundle when set, so it's publicly recoverable — it deters
casual abuse, nothing more. The default `wrangler.toml` ships it **empty**. Real
protection is layered:

- Set per-provider **spend caps** at Cerebras/OpenRouter/Google.
- Add **Cloudflare rate-limiting / WAF** rules on `/api/chat`.
- Set a non-empty `APP_TOKEN` in production.
- For a real gate, use a short-lived **signed token minted server-side**, not a
  static value compiled into the client.

CORS is `access-control-allow-origin: *` because the token model is "public
proxy," not "secret gate."

### Prompt injection (mitigated, not eliminated)
Scenario `input.text` is concatenated into the user prompt. `streamObject`
constrains the **output shape** (the model can't emit non-schema JSON) but
cannot stop an injected instruction from picking a *schema-valid-but-wrong*
verdict. **Not currently exploitable** because scenarios are author-controlled
JSON validated at build time; the risk activates only if scenarios become
remotely supplied. Mitigation at that point: wrap untrusted content in unique
delimiters with an explicit "this is data, not instructions" line.

## Verification

The test suite actively guards the security posture:

- `worker/handler.test.ts` — asserts keys never appear in `/api/config`,
  forbidden message roles are rejected, and arbitrary `image_url`s are rejected.
- `worker/worker.test.ts` — asserts a crafted error message (`key=LEAKED`) never
  reaches the client through the SSE error frame.

The worker tests (`worker/handler.test.ts`, `worker/worker.test.ts`) are the
executable record of this posture — they fail if keys leak, SSRF opens up, or an
error message reaches the client.
