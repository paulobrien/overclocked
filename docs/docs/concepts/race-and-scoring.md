---
sidebar_position: 1
---

# The Race & Scoring

A "race" is a timed window during which scenarios arrive on a shared conveyor
and each lane processes them. This page covers what a race is, the run modes,
and exactly how the score is computed.

## Run modes

A race runs in one of six modes, each defining a duration and an arrival cadence
(see `MODE_CONFIG` in `src/engine/arrivalPump.ts`):

| Mode | Duration | Use |
|---|---|---|
| `blitz` | 15s | max-frenzy clip |
| `short` | 30s | social cut |
| `standard` | 1 min | the default window |
| `extended` | 5 min | long demo / narration |
| `endless` | ∞ | runs until you stop it; counts elapsed time up |
| `sudden-death` | 90s | arrival rate ramps until one lane drowns |

The mode sets `durationSec` and `arrival: { intervalMs, maxQueue }`. The arrival
pump emits one scenario per `intervalMs`; when a lane's queue hits `maxQueue`,
extra arrivals spill into its `backlog` (the belt jams).

You can switch modes from the **lobby** before GO, or from the **preset
switcher** in the Stage (which restarts the race at the chosen window).

## The controls

During a race, the **Controls** bar (`src/stage/Controls.tsx`) offers:

- **Live timer** — remaining `M:SS` (or elapsed `∞` for endless).
- **Preset switcher** (30s / 1m / 5m / ∞) — restarts the race at that window.
- **↺ Reset** — return to the lobby.
- **⏹ End** — score the race immediately.

There is deliberately **no pause**: the lanes are live agents, so freezing the
clock can't freeze in-flight model calls. To halt a run, End it or Reset.

Pause/resume are real engine methods (`GameEngine.pause()` / `resume()`), not a
synthesize-and-end shortcut.

## How the score is computed

The headline formula (from `src/engine/scoring.ts` and `src/shared/contract.ts`):

```
score = Σ (partial × difficulty × BASE_POINTS)   over cleared items
```

where `BASE_POINTS = 100`.

- **`partial`** (0..1) — the fraction of the task's fields the agent got right,
  from the grader. A fully-correct answer is `1.0`; a totally wrong one is `0`.
- **`difficulty`** (1, 2, or 3) — the task's difficulty tier, which multiplies
  points and (intentionally) shows the speed gap more.
- A **wrong answer scores 0** but still consumes the lane's time — the realistic
  penalty. Throughput falls out naturally: the faster lane simply clears more
  items in the window, so "throughput × accuracy" needs no separate term.

So a perfect difficulty-3 item is worth `1 × 3 × 100 = 300` points.

### Resolved vs cleared

There are three related but distinct counts:

- **cleared** — items whose output matched ground truth (`partial > 0`),
  regardless of the operational verdict.
- **resolved** — items that were *both* output-correct *and* reached the correct
  verdict, *and* the case was resolvable (`correctOutcome.pass === true`). This
  is the honest "parcels handled correctly" number.
- **verdictCorrect** — whether the agent stamped the verdict the answer key said
  it should (accept / reroute / hold / refuse), independent of field accuracy.

The win banner and ROI card report **resolved** and **verdict accuracy**, not
raw cleared — those are the numbers that reflect real operational quality.

### The answer key

Every scenario carries a `correctOutcome` (`src/shared/contract.ts`):

```ts
interface CorrectOutcome {
  verdict: 'accept' | 'reroute' | 'hold' | 'refuse';
  pass: boolean;      // can this case be resolved at all?
  summary: string;    // one-line readout, e.g. "crushed → refuse"
}
```

This is first-class metadata, not inferred from the agent's output. It's what
the focus card compares against to show `✓ correct` / `✗ wrong verdict` and
`should be: REFUSE`. See [Tasks & Grading](./tasks-and-grading).
