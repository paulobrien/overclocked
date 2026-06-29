---
sidebar_position: 3
---

# The Multi-Agent Pipeline

Each parcel is processed by a **coordinated agent graph**, not a single model
call. This is the "multi-agent coordination" the judging criterion asks for —
and it's surfaced live in the focus card (the pipeline steps light up as each
agent runs) and in the lobby's "How it works" panel.

## The graph

```
        ┌─────────┐   ┌────────┐   ┌─────────┐  pass   ┌──────────┐
 item ─▶│ ROUTER  │─▶ │ WORKER │─▶ │ CHECKER │────────▶│ DECISION │─▶ graded
        └─────────┘   └────────┘   └────┬────┘         └──────────┘
                          ▲   retry ×1  │ fail
                          └─────────────┘
                                        │ low-conf / 2× fail / high-stakes
                                   ┌────▼─────────┐
                                   │ ESCALATION   │──▶ final call
                                   └──────────────┘
```

## The five roles

Each is built from one `createAgent(config)` factory (`src/agents/createAgent.ts`),
so they stay consistent — a new agent is a ~15-line config, not bespoke code.

| Role | Step | What it does |
|---|---|---|
| **Router** | Route | Reads the incoming parcel, classifies exception type + modality, and dispatches to the right worker specialist. *Load-bearing: one agent decides what another runs.* |
| **Worker** | Work | The specialist task agent — extracts the structured answer against the task schema. This is the actual work the grader scores. |
| **Checker** | Check | Independently reviews the worker's output against the source. Can **bounce the item back for one retry** when it catches an error. Where accuracy is won. |
| **Escalation** | Decide | A heavier second-look agent, invoked only for high-stakes or low-confidence items (customs holds, hazmat, high-value, suspected tamper). Conservative — when in doubt, hold or refuse. |
| **Orchestrator** | — | Runs the per-item graph and applies the retry/escalate/accept policy, emitting a coordination trace. The supervisor. |

## Why it widens the speed gap

Every extra hop **multiplies per-item latency**. The GPU lane drowns *harder*
under the same pipeline because it pays that latency at every hop. The killer
framing: *"Cerebras runs a 4-agent pipeline per parcel and still clears faster
than the GPU does a single pass."*

This is why there's a **pipeline depth toggle** (single-agent ↔ full graph) — a
great exhibition beat to show the accuracy lift the checker buys, and that the
fast lane still wins on speed at full depth.

## The retry / escalate policy

Encapsulated in `src/orchestrator/policy.ts`:

- **`shouldRetry`** — max one retry, only on a checker fail.
- **`shouldEscalate`** — escalates when the item is high-stakes
  (`adversarial` or `difficulty >= 3`), OR low-confidence (`checker.confidence <
  0.6`), OR the checker failed twice.

Coordination stats (`caught`, `retries`, `escalated`) are flavor + ROI — they
**never affect the score**, so the race stays clean. See [Fairness](./fairness).

## The pipeline depth toggle

The orchestrator (`src/orchestrator/pipeline.ts`) collapses to single-agent
depth when there's **no provider** (mock/human lanes can't run the role agents —
they need a real model) regardless of the configured depth. So the depth toggle
only affects lanes that actually have inference behind them, keeping the
behavior honest.

## The router dispatches for real

The router's output isn't decorative — its `taskType` decision actually changes
which worker specialist runs. If the router routes a parcel differently from its
nominal type, the worker follows the router's call. (Grading still uses the
scenario's true task, so the ground-truth comparison stays fair.) This makes the
"one agent decides what another runs" coordination genuinely load-bearing.
