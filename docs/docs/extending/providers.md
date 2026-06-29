---
sidebar_position: 3
---

# Adding a Model Provider

All three providers (Cerebras, OpenRouter, Gemini) run through the Vercel AI SDK
on the Worker, behind one symmetric code path. Adding a fourth is a contained
set of edits — the "blueprint test" for providers.

## When to add one

- You want a 4th lane (e.g. a local model, or a different GPU host).
- You want to swap what a lane points at (e.g. a different Gemini variant).

For *swapping* an existing lane's model, you usually don't need a new provider —
just change the model id in `wrangler.toml` or the lobby model field. This guide
is for adding a genuinely new provider backend.

## The AI SDK approach

The Worker resolves each provider to an AI SDK model in `buildModel()`
(`worker/index.ts`):

```ts
cerebras  → createOpenAICompatible({ baseURL, apiKey, name })(modelId)
openrouter→ createOpenAICompatible({ baseURL, apiKey, headers })(modelId)
gemini    → createGoogleGenerativeAI({ apiKey, baseURL })(modelId)
```

If your provider is **OpenAI-compatible** (most are: Groq, Together, local
vLLM/Ollama with the compat shim), use `createOpenAICompatible` — it's a
base-URL + key wrapper. If it has a dedicated `@ai-sdk/*` package, use that.

## The edits

### 1. Worker — `worker/index.ts`

- Add to the `ProviderId` union and the `Env` interface:
  `MYPROVIDER_API_KEY`, `MYPROVIDER_BASE_URL`, `MYPROVIDER_MODEL`.
- Add a `case` to `buildModel()` returning the AI SDK model.
- Add it to the `/api/config` response:
  `myprovider: { baseUrl, model, ready: !!env.MYPROVIDER_API_KEY }`.

### 2. Wrangler config — `wrangler.toml`

Add the `[vars]` (non-secret) base URL + model. The key is a secret:
`wrangler secret put MYPROVIDER_API_KEY` (or put it in `.dev.vars` for local).

### 3. Client config — `src/agents/streaming.ts`

Widen `ProviderConfig.provider` to include your id (e.g. `'myprovider'`).

### 4. Client + store — `src/agents/clients.ts` + `src/store/arena.ts`

- Add `makeMyProviderClient(model?)` mirroring the others.
- Add a lane in `buildLaneConfigs()` (and a `MOCK_PROFILES` entry if you want a
  mock fallback for it).

### 5. UI — `src/api/provider.ts` + `src/lobby/RunConfig.tsx` + `src/stage/Lane.tsx`

- Add the provider to `ProviderStatus` and a readiness row in the lobby.
- Add a lane-color + silicon-label case in `Lane.tsx`.

## The fairness reminder

A new provider lane gets the **same** scenario sequence and **identical**
grading as every other lane (see [Fairness](../concepts/fairness)). Don't add a
per-provider code path in the engine — the whole point is symmetry. The only
thing that should differ is `buildModel()`.

## Verifying

```bash
npm run dev:worker    # /api/config should show your provider's readiness
npm test              # the worker handler test covers validation
```

Set the key, flip mock off in the lobby, and race.
