---
sidebar_position: 2
---

# Testing

**179 unit tests across 19 files (Vitest)** + **10 end-to-end tests across 2
files (Playwright)**, all offline (no real API keys needed). The suite proves the
architecture hangs together and guards the contracts that matter.

## Run them

```bash
npm test            # vitest run — the 182 unit tests, one shot
npm run test:watch  # vitest watch
npm run test:e2e    # playwright — the 10 e2e tests (boots the Vite dev server)
npm run test:all    # vitest + playwright together
```

## Unit tests (Vitest)

| Suite | File | Tests | Guards |
|---|---|---|---|
| Graders | `src/tasks/graders.test.ts` | 42 | Every grader (full/partial/wrong), tolerance, `boolEq`, the **full 111-scenario pool** Zod-validity, correct-outcome metadata |
| Worker helpers | `worker/worker.test.ts` | 13 | Schema resolution, model building per provider, **`toModelMessages`** (system split + image_url→image), SSE re-wrap framing + reconstruction + error-isolation |
| Worker handler | `worker/handler.test.ts` | 10 | Request validation: bad provider/role, message schema, **SSRF image_url rejection, keys never leak** + placeholder-model flag in `/api/config`, system-only rejection |
| Scoring | `src/engine/scoring.test.ts` | 8 | `scoreItem` answer-key stamping, all aggregates |
| Arrival pump | `src/engine/arrivalPump.test.ts` | 9 | Weighted draw, difficulty spread, adversarial bias, seedQueue |
| Fairness | `src/engine/fairness.test.ts` | 8 | **Lanes receive identical scenarios**; clones independent; pool never exhausts; mode presets |
| parseOutput | `src/agents/createAgent.test.ts` | 13 | Fence/prose/coercion/malformed tolerance, tracking-number protection, **single-element-array enum unwrap** (Cerebras `["jam"]`→`"jam"`) while preserving genuine array fields |
| Image → data URL | `src/agents/image.test.ts` | 6 | base64 conversion, memoized cache, asset resolution |
| Prompt assembly | `src/tasks/prompt.test.ts` | 7 | system prompt, schema-to-instruction, multimodal message building |
| Registry | `src/tasks/registry.test.ts` | 7 | `getTaskType`/`findTaskType`/`allTaskTypes`/`taskIds`, unknown-id handling |
| Clients | `src/agents/clients.test.ts` | 8 | Mock determinism + errorRate, human resolver contract |
| Policy + trace | `src/orchestrator/policy.test.ts` | 13 | `shouldRetry`/`shouldEscalate` all branches, ROI math, trace |
| Pipeline | `src/orchestrator/pipeline.test.ts` | 4 | Single-agent collapse without a provider; router dispatch |
| Verdict | `src/orchestrator/verdict.test.ts` | 3 | The shared `deriveVerdict` matches every scenario's stamped `correctOutcome.verdict`; per-task disposition rules; clean escalation ≠ blanket hold |
| Agent roster | `src/data/agentRoster.test.ts` | 9 | Roster covers all roles + steps; every task has `humanControls` matching `focusFields` |
| Arena store | `src/store/arena.test.ts` | 7 | phase transitions, start/reset/endEarly, run config |
| Human input | `src/stage/humanInput.test.ts` | 4 | Resolver contract, skip/forfeit, safety timeout |
| Engine integration | `src/engine/loop.test.ts` | 9 | **Full mock race to completion**; endless; fairness convergence; provider-error surfacing; **offline circuit breaker**; **pacemaker arrivals** (fastest lane never backlogs) |
| Human lane integration | `src/stage/humanLane.test.ts` | 2 | A human lane completes items with answer-key stats populated |

## End-to-end tests (Playwright)

`npm run test:e2e` boots the Vite dev server on port 5199 and drives a real
browser through the user-visible journey (mock mode, no API keys). Two suites:

| Suite | File | Tests | Covers |
|---|---|---|---|
| The core race flow | `e2e/race.spec.ts` | 7 | Lobby logo + task explorer + GO; browsing a task's scenarios; the agent-roster panel; GO starts a race (lanes, scoreboard, controls); End scores + winner banner; Reset to lobby; a 15s blitz auto-ends |
| The human lane | `e2e/human.spec.ts` | 3 | "I Wanna Play" shows the inline human lane panel during a race; submitting clears the question; Skip forfeits the parcel |

## The load-bearing tests

A few tests are worth understanding because they guard the demo's integrity:

- **`fairness.test.ts`** — asserts `nextArrival(['a','b','c'])` returns clones
  with identical `taskTypeId`/`groundTruth`/`correctOutcome`. If this breaks, the
  race isn't fair.
- **`loop.test.ts` "runs a blitz race to completion"** — fast-forwards a full
  mock race with fake timers. If any layer (pump → pipeline → grader → scoring)
  is broken, the race never completes or the numbers are wrong.
- **`graders.test.ts` "every scenario validates against its schema"** — runs the
  loader over all 111 scenarios. A malformed scenario fails here, at test time,
  not mid-demo.
- **`handler.test.ts` "never leaks keys"** — asserts `/api/config` returns no
  key material.
- **`e2e/race.spec.ts` "End scores the race and shows the winner banner"** —
  boots the real app, runs a mock race, and asserts the win banner renders. If
  the store → engine → UI wiring is broken end-to-end, this fails.

## Test conventions

- **No network.** Real model calls are stubbed (mock clients, fake timers, a
  keyed-env stub for the Worker). The Vitest suite runs in ~1s.
- **Determinism where it matters.** `Math.random` is stubbed via `vi.spyOn` for
  the weighted-draw and errorRate tests; statistical tests use wide tolerances.
- **Fake timers** (`vi.useFakeTimers({ shouldAdvanceTime: true })`) drive the
  engine e2e so a 15s race completes in milliseconds.
- **Playwright e2e is a separate command** (`npm run test:e2e`) because it boots
  the real Vite dev server and drives a real browser. It runs in mock mode so no
  keys are needed; selectors are scoped by role/title to stay robust.

## Type checking

```bash
npm run typecheck    # tsc -b for the app, separate for the worker
```

Both the app (`tsconfig.app.json`) and Worker (`worker/tsconfig.json`) are
strict. The build (`npm run build`) typechecks before bundling.
