---
sidebar_position: 1
---

# Running Locally

Two ways to run: **mock lanes** (zero API calls, races immediately — the default)
and **live** (real inference through the Worker).

## Mock mode (fake-first)

The whole thing runs end-to-end on mock agents with no network:

```bash
npm install
npm run dev          # Vite app on http://localhost:5173
```

Open the lobby, confirm **"● MOCK LANES"**, pick a mode, hit **GO**. The mock
lanes use deterministic fake latency tuned to show the speed gap (Cerebras fast,
Gemini mid, GPU slow).

This is the de-risked demo path: if a provider flakes during judging, a lane can
fall back to its mock and still race.

## Live mode (real inference)

The browser never holds keys. Start the Worker, which injects secrets and
streams model responses:

```bash
# 1. Configure secrets for local dev
cp .dev.vars.example .dev.vars
#   then put real keys in .dev.vars:
#     CEREBRAS_API_KEY=sk-...
#     OPENROUTER_API_KEY=sk-or-...
#     GEMINI_API_KEY=AIza...

# 2. Start the Worker (agent backend)
npm run dev:worker    # wrangler dev on http://localhost:8787

# 3. The Vite proxy forwards /api → the Worker (already configured)
npm run dev
```

In the lobby, flip **"Mock lanes" OFF** — you'll see readiness flags for each
provider's key. Hit GO.

To run both at once:

```bash
npm run dev:all       # frontend + worker via concurrently
```

## Setting the real models

The default models live in `wrangler.toml` `[vars]` as **placeholders** — replace
them with the exact ids your providers serve before going live:

```toml
CEREBRAS_MODEL    = "gemma-4-31b"            # PLACEHOLDER — the id Cerebras serves
OPENROUTER_MODEL  = "google/gemma-4-31b"     # PLACEHOLDER — matching GPU-hosted id
GEMINI_MODEL      = "gemini-3.1-flash-lite"  # PLACEHOLDER — the GA Flash Lite id
```

A wrong/unavailable id doesn't fail the build — it shows up at demo time as an
opaque `upstream_error`, so verify them first.

The headline demo runs the **same model** on the Cerebras and GPU lanes (pure
silicon-vs-silicon). Override per-lane in the lobby's model fields for
exhibition rounds.

:::warning Spend caps
Live mode bills your provider accounts. Set per-provider spend caps at
Cerebras/OpenRouter/Google and consider Cloudflare rate-limiting on `/api/chat`.
:::

## Ports

Vite defaults to `5173`; the Worker to `8787`. If either is occupied (the dev
server falls back to the next free port), update `VITE_AGENT_BASE` or the Vite
proxy target in `vite.config.ts`.

## Deploy

The app and the Worker deploy **separately**, then must be wired so the browser
can reach `/api`. The Vite proxy is dev-only and has **no production equivalent** —
so a plain `deploy:pages` alone yields a site that 404s every `/api` call. Wire
one of the two routes below.

```bash
# 1. Auth + secrets + replace model-id placeholders in wrangler.toml
wrangler login
wrangler secret put CEREBRAS_API_KEY      # repeat for OPENROUTER_API_KEY, GEMINI_API_KEY

# 2. Deploy the Worker, note its URL
npm run deploy:worker      # → https://overclocked-worker.<subdomain>.workers.dev

# 3. Wire /api → Worker (pick ONE):
#    (a) Direct call — copy .env.production.example → .env.production,
#        set VITE_AGENT_BASE to the Worker URL (recommended; best metric fidelity).
#    (b) Same-origin proxy — copy public/_redirects.example → public/_redirects,
#        fill in the Worker URL, and build with VITE_AGENT_BASE UNSET.

# 4. Build + deploy the app
npm run build
npm run deploy:pages

# 5. Verify on the live origin: GET /api/health → {ok:true};
#    GET /api/config → ready:true per configured provider. Then flip Mock OFF.
```
