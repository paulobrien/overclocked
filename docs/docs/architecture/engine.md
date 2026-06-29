---
sidebar_position: 2
---

# The Engine

`src/engine/loop.ts` — a framework-free, deterministic tick loop that drives the
whole race. It owns cadence and state; React only subscribes.

## The `GameEngine` class

```ts
class GameEngine {
  constructor(opts: { mode, lanes, smoothing? }, cb: EngineCallbacks)
  start()        // begin the race
  pause()        // halt arrivals + countdown, keep state
  resume()       // restart intervals without re-seeding
  stop()         // full halt (used by reset / end)
}
```

The callbacks are the *only* way the engine talks to the outside world:

```ts
interface EngineCallbacks {
  onLaneUpdate: (laneId, runtime: LaneRuntime) => void;
  onTick: (timeLeft: number) => void;
  onEnd: (results: Record<string, LaneRuntime>) => void;
}
```

The Zustand store wires these to `set()` calls, so every lane update flows into
React. The engine never imports React.

## What runs on each tick

`start()` sets up two intervals (extracted into `startIntervals()` so `resume()`
can re-use them):

1. **Arrival pump** (every `arrival.intervalMs`): calls `nextArrival(laneIds)`,
   which draws **one** scenario and pushes an identical clone to every lane's
   queue. When a lane's queue is at `maxQueue`, the arrival spills into
   `backlog` instead — the belt jams.
2. **Master tick** (every 1000ms): decrements `timeLeft` (or counts elapsed for
   endless), fires `onTick`, runs the sudden-death ramp, and decays each lane's
   smoothed tokens/sec so the speedometer drifts down when idle. Ends the race
   when `timeLeft <= 0` (never for endless).

## The per-lane processing loop

Each lane has its own async `processLane(lane, runtime)` loop:

```
pull next scenario → runPipeline(...) → scoreItem(...) → update stats → repeat
```

- If the queue is empty, it re-arms a short `setTimeout` and waits.
- After the pipeline `await`s (real model calls can take seconds), it
  **re-checks `this.running`** before mutating — so an ended/reset race doesn't
  get stale writes.
- Each lane paces its next item slightly (Cerebras faster than others) so the
  belt reads naturally.

## State: `LaneRuntime`

```ts
interface LaneRuntime {
  queue: TaskScenario[];      // pending parcels
  backlog: number;            // overflow (drives the handler's stress)
  cleared: number;            // resolved items
  score: number;
  smoothedTps: number;        // EMA of tokens/sec for the speedometer
  busy: boolean;              // is this lane mid-item?
  focus: LaneFocus | null;    // the current focus-card contents
  items: ScoredItem[];        // full history (for the summary)
  // ...caught, escalated, tokensPerSec, itemNo, lastItems
}
```

`backlog` is the emotional engine: it drives the [Handler](../architecture/stage)
character's stress state and the belt jam — the strongest readability signal.

## Ending a run

There is deliberately **no pause** — the lanes are live agents, so freezing the
clock can't freeze in-flight model calls (it would just decouple the timer from
reality). A run is **ended** (scored) or **reset** (back to lobby), never paused.

- **`end()`** is **idempotent** (an `ended` flag guards double-fire: a final tick
  at 0 + a manual "End" could otherwise fire `onEnd` twice → double confetti).

## Supporting modules

- `src/engine/arrivalPump.ts` — `drawScenario`, `nextArrival`, `cloneScenario`,
  `MODE_CONFIG`. The fairness contract lives here.
- `src/engine/scoring.ts` — `scoreItem`, `totalScore`, `resolvedCount`,
  `clearedCount`, `verdictAccuracy`, `meanTokensPerSec`. Pure functions over
  `ScoredItem[]`.

## Testing the engine

The engine integration test (`src/engine/loop.test.ts`, run under Vitest — not
the Playwright e2e suite) runs a full mock race with fake timers
and a near-zero-latency mock profile, fast-forwarding past the window. It
asserts: the loop ends, both lanes score, items carry the answer-key fields,
pause freezes the countdown, endless never ends, and both lanes process an equal
count (the fairness convergence check).
