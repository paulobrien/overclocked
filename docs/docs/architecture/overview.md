---
sidebar_position: 1
---

# Architecture Overview

Four clean layers. Build (and read) them in this dependency order — each layer
only depends on the ones below it.

```
┌────────────────────────────────────────────────────────────────┐
│  STAGE (React + Tailwind + Framer Motion)                       │
│  Belt · FocusCard · Handler · Scoreboard · HUD · Controls       │
│      ▲ subscribes via selectors                                  │
├──────────────────────────────────────────────────────────────────┤
│  ARENA STORE (Zustand)                                           │
│  phase · lanes · scores · timer · runConfig · summary            │
│      ▲ driven by engine callbacks                                │
├──────────────────────────────────────────────────────────────────┤
│  ENGINE (framework-free, deterministic tick loop)                │
│  arrival pump → per-item PIPELINE in each lane → grade → score   │
└───────┬────────────────────┬───────────────────┬─────────────────┘
        │                    │                   │
┌───────▼─────────┐ ┌────────▼─────────┐ ┌───────▼──────────────┐
│  TASK SYSTEM     │ │  ORCHESTRATOR    │ │  AGENT CLIENTS       │
│  registry        │ │  router → worker │ │  Cerebras | GPU      │
│  schemas         │ │  → checker →     │ │  | Gemini | Human    │
│  graders         │ │  escalate        │ │  | Mock              │
└──────────────────┘ └──────────────────┘ └──────────────────────┘
```

## The flow of a single item

1. The **arrival pump** draws one scenario and broadcasts identical clones to all
   lanes' queues (the [fairness contract](../concepts/fairness)).
2. Each lane, the instant it's free, pulls the next scenario and runs it through
   the **pipeline** (`src/orchestrator/pipeline.ts`): router → worker → checker
   → (maybe) escalation. Each step is a model call through the lane's
   `AgentClient`.
3. The pipeline emits a `CoordinationTrace` + the final structured output.
4. The **grader** scores that output against ground truth, stamps the
   `correctOutcome` (verdict correctness, resolved).
5. The engine updates the lane's score / backlog / tokens-per-sec and emits a
   lane update → the store → React re-renders.

The whole thing is driven by a deterministic `setInterval` tick loop in the
engine; React never drives timing.

## The shared contract holds it together

`src/shared/contract.ts` is the single file that defines every type the layers
exchange: `TaskType`, `TaskScenario`, `AgentResult`, `GradeResult`,
`CorrectOutcome`, `AgentClient`, `CoordinationTrace`. Both the app *and* the
Worker import it. If you change a shape, change it there first.

## Key design properties

- **Framework-free engine.** `src/engine/loop.ts` is a plain `class` with
  callbacks — no React. That makes the loop testable (the engine integration
  test fast-forwards it with fake timers) and the UI swappable.
- **Data separate from code.** Scenarios are JSON in `data/scenarios/`,
  validated at load time. Adding a scenario is a data edit, not a code change.
- **Symmetric agents.** Cerebras, GPU, Gemini, Mock, and Human all implement the
  *same* `AgentClient` interface — the lanes are interchangeable, which is what
  guarantees identical grading.
- **Fake-first.** The engine runs start-to-finish on mock lanes with zero API
  calls. If a provider flakes mid-demo, switch a lane to its mock and it still
  races.

## File map

| Path | Responsibility |
|---|---|
| `src/shared/contract.ts` | The types every layer exchanges |
| `src/engine/` | The tick loop, arrival pump, scoring |
| `src/orchestrator/` | The per-item agent graph + policy |
| `src/agents/` | `createAgent` factory, clients, streaming, roles, image→data-URL |
| `src/tasks/` | Schemas, graders, registry, task configs |
| `src/data/` | Scenario loader, agent roster (the docs data) |
| `src/store/arena.ts` | The Zustand store (all match state) |
| `src/stage/` | React components (cabinet, lanes, handler, logo, controls) |
| `src/lobby/` | Pre-race lobby (task explorer, run config) |
| `src/audio/sfx.ts` | WebAudio-synthesized SFX (zero asset weight) |
| `worker/index.ts` | The Cloudflare Worker (AI SDK host, key injection) |
| `data/scenarios/*.json` | The 111 scenario pool |
| `scripts/` | Asset + outcome generators |
| `e2e/` | Playwright end-to-end tests (race + human lane) |
| `docs/` | The Docusaurus developer documentation site |

Read the layer-specific pages for the details:
[Engine](./engine) · [Agents](./agents) · [Worker](./worker) · [Stage](./stage).
