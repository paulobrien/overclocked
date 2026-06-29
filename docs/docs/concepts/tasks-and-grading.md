---
sidebar_position: 2
---

# Tasks & Grading

The shared contract that makes 17 heterogeneous tasks gradeable and both lanes
comparable: **every task returns a small structured object validated by Zod and
checked by a deterministic grader against known ground truth.** Never grade
open-ended prose.

## The pieces

A task is a `TaskType` (`src/shared/contract.ts`) with five responsibilities:

```ts
interface TaskType {
  id: string;                 // 'damage-assessment'
  label: string;              // 'Damage Assess'
  icon: string;               // '📦'
  modality: 'vision' | 'document' | 'text' | 'video';
  difficulty: 1 | 2 | 3;      // drives points + the visible speed gap
  outputSchema: ZodSchema;    // THE single source of truth for this task
  buildPrompt(s): Promise<ChatMessages>;   // multimodal-aware prompt assembly
  grade(output, truth): GradeResult;       // deterministic comparison
  focusFields?: FocusFieldSpec[];          // which rows the focus card renders
  humanControls?: HumanControl[];          // the "I Wanna Play" overlay inputs
}
```

The **Zod schema is the single source of truth**. From it derives: the prompt's
format instruction, the parser, the grader's expected fields, and (via
`focusFields`) which rows light up on the focus card. Define the schema once and
everything else follows.

## The 17 shipped tasks

Grouped by modality (the "warehouse sortation line" world):

| Modality | Tasks |
|---|---|
| **Vision** | label-parse, damage-assessment, hazmat-detection, seal-tamper, dim-weight, pallet-check, handwritten-label |
| **Document** | customs-invoice, manifest-recon, docs-completeness |
| **Text** | tariff-classification, exception-routing, address-validation, carrier-select, sla-risk, rma-disposition, restricted-screening |

Each is a config object in `src/tasks/types/index.ts`, ~15 lines, wiring a
schema (`src/tasks/schemas.ts`) to a grader (`src/tasks/graders.ts`).

## How grading works

Each grader is a pure function `(output, truth, difficulty) => GradeResult` that
compares the agent's parsed output to ground truth field-by-field:

```ts
interface GradeResult {
  correct: boolean;     // did it match closely enough to count?
  partial: number;      // 0..1 — fraction of fields correct
  scoreDelta: number;   // partial × difficulty × BASE_POINTS
  detail: string;       // readout for the focus card
  fields?: { key, label, ok, expected?, got? }[];
  correctVerdict?: Verdict;
  correctSummary?: string;
}
```

Graders are **tolerant by design** — case/whitespace-insensitive. With the same
model on both lanes, any format quirk hits both equally, so tolerance can't bias
the race (a bonus of the same-model default).

### A subtle correctness rule: `boolEq`

Boolean fields use a dedicated `boolEq()` comparator, not `!!a === !!b`. Why? A
**missing** boolean field must NOT count as "correct false" — otherwise an empty
or garbage output would score free points on every false-valued truth field. The
test suite caught and fixed this:

```ts
function boolEq(a: unknown, b: unknown): boolean {
  if (typeof a !== 'boolean') return false;   // missing ≠ correct
  return a === !!b;
}
```

Some fields get tolerance bands instead of exact match: numbers (e.g. dims ±1cm,
weight ±0.5kg), ETA (±2h). See `src/tasks/graders.ts` for each task's rules.

## The scenario pool

Scenarios are **data, separate from code** — one JSON file per task in
`data/scenarios/<task-id>.json`, 111 total. Each scenario is truth-first: the
ground-truth object was decided *first*, then the input written to match.

```json
{
  "id": "dm-2",
  "taskTypeId": "damage-assessment",
  "difficulty": 2,
  "adversarial": true,
  "input": { "imageUrl": "/data/assets/damage/dm-2.png", "text": "..." },
  "groundTruth": { "damaged": true, "damageType": "crushed", "severity": 4, "action": "refuse" },
  "correctOutcome": { "verdict": "refuse", "pass": false, "summary": "Badly crushed corner — refuse." }
}
```

The loader (`src/data/scenarios.ts`) imports every `*.json` via
`import.meta.glob` and **Zod-validates each scenario against its task schema at
load time** — a malformed scenario fails the build, never reaching the demo.

Adversarial cases (tamper, hazmat mislabel, customs undervaluation, counterfeit
goods) are salted in at ~22% draw rate and double as the natural triggers for the
Exceptions Specialist in the [multi-agent pipeline](./multi-agent-pipeline).

See [Authoring Scenario Data](../extending/data) for how to add more.
