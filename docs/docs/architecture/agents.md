---
sidebar_position: 3
---

# The Agent Layer

`src/agents/` — the `createAgent` factory, the unified `AgentClient`, the
streaming client, and the role agents. Everything that talks to a model lives
here.

## The unified `AgentClient`

Every lane — Cerebras, GPU, Gemini, Mock, Human — implements the *same*
interface (`src/shared/contract.ts`):

```ts
interface AgentClient {
  name: string;
  run(scenario: TaskScenario, task: TaskType): Promise<AgentResult>;
}
```

That symmetry is what guarantees a fair race: identical interface, identical
pipeline, identical grader. Swapping a lane's client is a one-line change.

## `createAgent(config)` — the one factory

All five agent roles are built from the same factory
(`src/agents/createAgent.ts`). Most of `buildMessages`, `parse`, and the
streaming call are identical across every agent — only the schema and system
prompt differ. A new agent is a ~15-line config:

```ts
createAgent({
  id, role, label, modality, taskTypeId?,
  outputSchema,         // the single source of truth
  systemPrompt,
  buildMessages(input), // async (vision images are base64-encoded first)
})
```

`run()` streams the completion, parses the JSON against the schema, and records
real tokens/sec. Parsing is **tolerant** — `parseOutput` strips markdown fences,
extracts the first balanced `{...}`, validates against the Zod schema, and
coerces obvious stringified numbers/booleans as a last resort. (This is the
defensive fallback; the Worker's `streamObject` now emits schema-valid JSON
directly.)

## The streaming client

`src/agents/streaming.ts` — `streamChat()` POSTs to the Worker (`/api/chat`) and
parses the OpenAI-shaped SSE the Worker emits. It measures **real tokens/sec**
off the stream (estimated tokens ÷ send-to-last-token wall-clock), which feeds
the speedometer.

The request body carries the schema identity the Worker needs to run structured
output:

```ts
{ provider, model?, role, taskTypeId, messages, temperature, max_tokens }
```

`ProviderConfig.provider` is `'cerebras' | 'openrouter' | 'nvidia' | 'gemini'`. Vision
images are converted to base64 data URLs *before* sending
(`src/agents/image.ts`) — a relative asset path can't be consumed by the model.

## The six clients (`src/agents/clients.ts`)

| Client | What it does |
|---|---|
| `makeCerebrasClient` | Cerebras lane via `@ai-sdk/openai-compatible` |
| `makeOpenRouterClient` | GPU challenger via `@ai-sdk/openai-compatible` |
| `makeNvidiaClient` | Alternative GPU challenger (NVIDIA NIM), same wrapper — selectable per-run |
| `makeGeminiClient` | Gemini lane via `@ai-sdk/google` |
| `makeMockClient` | Deterministic fake: draws output from ground truth, tunable `errorRate`, fake latency + tokens/sec. **The fake-first fallback.** |
| `makeHumanClient` | Awaits a resolver (the click-to-classify overlay); measures wall-clock, `tokensPerSec: 0` |

The mock profiles (`MOCK_PROFILES`) tune the visible gap: Cerebras fast
(1800 tok/s), Gemini mid (740), GPU slow (110), human zero.

## The role agents (`src/agents/roles.ts`)

Router, Checker, Escalation — each a `createAgent()` config with its own schema
(`RouterSchema`, `CheckerSchema`, `EscalationSchema` in `src/tasks/schemas.ts`).
They take `(scenario)` or `{ scenario, workerOutput }` as input and don't
construct a provider themselves — they receive it at `.run()` time from the
orchestrator.

## How a call flows end to end

```
Lane.run(scenario, task)
  → workerAgentFromTask(task).run(scenario, provider)
    → streamChat(messages, provider, ctx { role, taskTypeId })
      → POST /api/chat  (Worker runs streamObject + re-wraps as SSE)
      ← SSE delta frames (schema-valid JSON chunks)
    → parseOutput(text, schema)  [tolerant fallback]
  → AgentResult { output, raw, tokens, latencyMs, tokensPerSec }
```

The orchestrator chains these (router → worker → checker → escalation) per item.
See [The Multi-Agent Pipeline](../concepts/multi-agent-pipeline).
