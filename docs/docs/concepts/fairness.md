---
sidebar_position: 4
---

# Fairness: Same Tasks, Different Silicon

The single most important property of the race: **every lane sees the identical
scenario sequence, and is graded identically — the only variable is the
silicon.** If this breaks, the demo is meaningless. This page documents the
contract and where it's enforced.

## The contract

At every arrival tick, the engine draws **one** scenario and broadcasts
**identical clones** to every lane. The draw is random (so every run differs)
but **shared** (so within a run, all lanes get the same tasks in the same order).

```
            ┌─ clone A ─→ Cerebras lane
nextArrival ─┼─ clone B ─→ GPU lane        (same taskTypeId, groundTruth,
            └─ clone C ─→ Gemini lane      correctOutcome — distinct instances)
```

## Where it's enforced

`src/engine/arrivalPump.ts` exposes `nextArrival(laneIds)`:

```ts
export function nextArrival(laneIds: string[]): TaskScenario[] {
  const base = drawScenario();           // ONE draw
  return laneIds.map(() => cloneScenario(base));  // one clone per lane
}
```

`cloneScenario` deep-clones with a fresh per-instance `id` (so lanes don't share
mutable state) but preserves a shared `baseId` (for fairness tracing) and the
same `groundTruth` / `correctOutcome` by value.

The engine's arrival pump, the sudden-death ramp, **and** the initial seeding
all use this — there is no per-lane `drawScenario()` call anywhere in the hot
path. (`src/engine/loop.ts`.)

## It's tested

`src/engine/fairness.test.ts` asserts the contract directly:

- `nextArrival(['a','b','c'])` returns clones with **identical** `taskTypeId`,
  `groundTruth`, and `correctOutcome`.
- Each clone is an **independent instance** (distinct `id`, shared `baseId`),
  and mutating one doesn't affect the others.
- The pool draws forever without throwing (2000 draws stay in-pool) — it never
  exhausts, which is what makes [endless mode](./race-and-scoring#run-modes)
  possible.

## The other half of fairness: identical grading

It's not enough for lanes to get the same tasks — they must be *graded* the same
way. This holds because:

1. **All lanes run the identical pipeline.** In live mode every provider lane
   runs the same agent graph (router → worker → checker → escalation) — same
   prompts, schemas, retry/escalate policy. In the default mock mode (no
   provider) every lane deterministically collapses to a single worker pass,
   identically — so the pipeline is symmetric across lanes either way.
2. **The grader is deterministic** and compares against the same `groundTruth`.
3. **Structured output (`streamObject` + Zod)** constrains every lane's output
   to the same shape — there's no "the model rambled" variance.
4. Coordination stats (`caught`, `retries`, `escalated`) are flavor only and
   **never enter the score**.

So when Cerebras beats the GPU, it's because it cleared more of the *same* tasks
correctly in the window — not because it got easier ones or was graded more
leniently.

## The same-model default

The headline demo runs the **same model** on both lanes (e.g. Gemma on Cerebras
silicon vs. the same Gemma GPU-hosted). This is the purest comparison — any
format quirk or capability gap hits both lanes equally, so it can't bias the
race. The challenger is switchable for "exhibition" rounds, but the default is
apples-to-apples silicon-vs-silicon.
