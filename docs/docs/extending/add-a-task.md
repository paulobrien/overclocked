---
sidebar_position: 1
---

# Adding a Task Type

The blueprint test from the design spec: *adding task #18 should mean writing
**one config** (plus a schema + grader) — nothing else. If it requires touching
the engine, the blueprint has leaked.* This guide is that one config.

There are **four** small edits, all in `src/tasks/`. No engine, orchestrator, or
UI changes — they all derive from the schema.

## 1. Add the Zod schema

In `src/tasks/schemas.ts`, define the output shape (this is the single source of
truth) and register it in `SCHEMA_BY_TASK`:

```ts
// src/tasks/schemas.ts
export const MyTaskSchema = z.object({
  result: z.string(),
  confidence: z.number().min(0).max(1),
});
export type MyTask = z.infer<typeof MyTaskSchema>;

// ...and at the bottom:
export const SCHEMA_BY_TASK: Record<string, z.ZodType<any>> = {
  // ...existing
  'my-task': MyTaskSchema,
};
```

:::note Structured-output compatibility
`streamObject` constrains the output shape. Stick to `z.object` of
`string`/`number`/`boolean`/`enum`/`array(string)` — all of the shipped schemas
do, which is why they work with Gemini's structured output mode. Avoid
`z.union` / `z.any` in *output* schemas.
:::

## 2. Add the grader

In `src/tasks/graders.ts`, write a deterministic `(output, truth, difficulty) =>
GradeResult` and register it:

```ts
// src/tasks/graders.ts
export const gradeMyTask: Grader = (output, truth, difficulty) => {
  const o = output as Record<string, unknown>;
  const checks: FieldCheck[] = [
    { key: 'result', label: 'Result', expected: truth.result, got: o.result, ok: strEq(o.result, truth.result) },
    { key: 'confidence', label: 'Confidence', expected: truth.confidence, got: o.confidence,
      ok: Math.abs(Number(o.confidence) - Number(truth.confidence)) <= 0.1 },
  ];
  return gradeFromChecks(checks, difficulty, 'My task done');
};

// ...and in GRADERS:
export const GRADERS: Record<string, Grader> = {
  // ...existing
  'my-task': gradeMyTask,
};
```

Use the shared helpers: `strEq` (tolerant string compare), `boolEq` (requires a
real boolean — a missing field is *not* "correct false"), `gradeFromChecks`.
Numeric fields can take a tolerance band.

## 3. Add the task config

In `src/tasks/types/index.ts`, add a `TaskType` object to the `TASK_TYPES`
array (~15 lines):

```ts
{
  id: 'my-task',
  label: 'My Task',
  icon: '🔧',
  modality: 'text',          // or 'vision' / 'document'
  difficulty: 2,
  outputSchema: MyTaskSchema,
  buildPrompt: async (s) => [
    { role: 'system', content: systemPrompt('my task specialist', MyTaskSchema) },
    await buildUserMessage(s),
  ],
  grade: (o, t) => gradeMyTask(o, t, 2),
  focusFields: [
    { key: 'result', label: 'Result' },
    { key: 'confidence', label: 'Confidence' },
  ],
  humanControls: [
    { key: 'result', label: 'Result', kind: 'text' },
    { key: 'confidence', label: 'Confidence (0-1)', kind: 'number' },
  ],
},
```

That's it for code. The registry, orchestrator, engine, focus card, HUD, lobby
explorer, and human overlay all derive from the schema + `focusFields` +
`humanControls`.

## 4. Add scenarios

Create `data/scenarios/my-task.json` — an array of scenarios. See
[Authoring Scenario Data](./data). The loader picks it up automatically and
Zod-validates it at load time.

## 5. (Vision only) Add an asset

If `modality: 'vision'`, generate the PNG asset referenced by `input.imageUrl`
(rendered from the scenario's ground truth, so the task is actually solvable) —
extend `scripts/gen-assets.ts` and run `npm run gen:assets`. (Real photos can
replace these; see the data guide.)

## Verify

```bash
npm test            # the pool-validation test will check your scenarios + grader
npm run typecheck   # the schema is wired everywhere
npm run dev         # your task appears in the lobby explorer + races
```

The "every shipped grader handles a wrong answer with scoreDelta 0" test will
also smoke-test your new grader automatically once it's in `GRADERS`.
