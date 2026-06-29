---
sidebar_position: 2
---

# Authoring Scenario Data

Scenario data is **separate from code** — one JSON file per task type in
`data/scenarios/`. This keeps content authoring decoupled from the build and lets
non-engineers add cases.

## The file convention

`data/scenarios/<task-id>.json` — a JSON array of scenarios. The loader
(`src/data/scenarios.ts`) auto-discovers every `*.json` in that folder via
`import.meta.glob`, so dropping in a new file is enough; no registry edit.

## Scenario shape

```json
[
  {
    "id": "mt-1",
    "taskTypeId": "my-task",
    "difficulty": 2,
    "adversarial": false,
    "input": {
      "text": "Classify this item: ...",
      "imageUrl": "/data/assets/my-task/mt-1.png",
      "documents": ["--- optional doc ---\n..."]
    },
    "groundTruth": { "result": "allowed", "confidence": 0.9 },
    "correctOutcome": { "verdict": "accept", "pass": true, "summary": "allowed item" },
    "blurb": "one-line lobby description"
  }
]
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | unique, e.g. `mt-1` |
| `taskTypeId` | yes | must match a registered task |
| `difficulty` | yes | `1`, `2`, or `3` |
| `input.text` | one of | the prompt text the worker sees |
| `input.imageUrl` | for vision | asset path (served from `/data/assets/`) |
| `input.documents` | optional | attached doc text |
| `groundTruth` | yes | the authored answer — must validate against the task schema |
| `correctOutcome` | yes | the answer key (verdict / pass / summary) |
| `adversarial` | optional | marks highlight-reel cases; drawn ~22% of the time |
| `blurb` | optional | lobby explorer description |

## Truth-first discipline

Decide the **ground-truth object first**, then write the input to match it. The
label is *authored*, not back-inferred from text the model might write. E.g.
decide "crushed, severity 4, refuse," *then* write the matching parcel
description / image prompt.

## Correct outcomes

Every scenario must declare a `correctOutcome`. The `verdict` is the operational
decision the agent should stamp; `pass` is whether resolving counts (refused
parcels are `pass: false` — rejecting them isn't "clearing" them). You can
derive these in bulk with the migration script:

```bash
npx tsx scripts/add-correct-outcome.ts
```

It reads each scenario's ground truth, computes the verdict deterministically via
the **shared `deriveVerdict`** (`src/orchestrator/verdict.ts`) — the same
function the engine stamps with, so the answer key and the engine can't drift —
and stamps `correctOutcome`. Re-runnable and idempotent — useful after authoring
new scenarios.

## Validation is enforced

The loader Zod-validates **both** the envelope (incl. `correctOutcome`) **and**
the `groundTruth` against the task's output schema. A malformed scenario fails
the build with a precise error:

```
[scenarios] invalid scenario pool:
  - data/scenarios/my-task.json → mt-3: groundTruth.confidence: expected number, received string
```

So you can't ship a broken pool by accident.

## Generating scenarios at scale

For a large batch (the spec targets 8–15 per task type), use the generator:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run datagen -- <task-id> [count]      # e.g. npm run datagen -- tariff-classification 6
npm run datagen -- --list                 # list valid task ids
```

`scripts/generate.ts` feeds the task's Zod schema to Claude (via the official
Anthropic SDK, structured output) as the contract, asks it to emit
ground-truth-first across difficulty tiers with adversarial cases salted in,
**Zod-validates every candidate against the task schema**, stamps
`correctOutcome`, and merges new scenarios into `data/scenarios/<task-id>.json`
(skipping the build-breaking invalids). It writes only `text`/`documents`
scenarios; **vision** tasks still need an asset-production step (the image must
genuinely match the label) — run `npm run gen:assets` and wire `imageUrl` by
hand for those.
