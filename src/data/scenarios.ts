/**
 * Scenario pool loader — imports the JSON scenario files from the top-level
 * data/scenarios/ folder and Zod-validates each against its task schema (§7).
 *
 * Data is kept SEPARATE from code: scenarios live in /data/scenarios/<task>.json,
 * one file per task type, authored truth-first (ground truth decided before the
 * input text). This loader is the only thing that touches those files at build
 * time. Vite's import.meta.glob bundles them in; a malformed scenario fails the
 * build, never reaching the demo.
 *
 * "Feed the Zod schema as the contract ... Validate every scenario through the
 *  Zod parser before it enters the pool, so a malformed one fails at build time,
 *  not mid-demo." — §7
 */
import type { TaskScenario } from '../shared/contract';
import { SCHEMA_BY_TASK } from '../tasks/schemas';
import { z } from 'zod';

/** Validates the correct-outcome metadata every scenario must carry. */
const CorrectOutcomeSchema = z.object({
  verdict: z.enum(['accept', 'reroute', 'hold', 'refuse']),
  pass: z.boolean(),
  summary: z.string().min(1),
});

/** Validates the common scenario envelope (task-specific ground truth is
 *  validated separately against the task's output schema). */
const ScenarioSchema = z.object({
  id: z.string().min(1),
  taskTypeId: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  correctOutcome: CorrectOutcomeSchema,
  groundTruth: z.record(z.unknown()),
  input: z.object({
    text: z.string().optional(),
    imageUrl: z.string().optional(),
    documents: z.array(z.string()).optional(),
    frames: z.array(z.string()).optional(),
    videoUrl: z.string().optional(),
  }),
  adversarial: z.boolean().optional(),
  blurb: z.string().optional(),
});

// Eagerly import every *.json in the data/scenarios folder. `as: 'raw'` would
// give strings; default import gives the parsed JSON object directly.
const modules = import.meta.glob('/data/scenarios/*.json', { eager: true, import: 'default' }) as Record<string, TaskScenario[]>;

function loadPool(): TaskScenario[] {
  const pool: TaskScenario[] = [];
  const errors: string[] = [];

  for (const [path, scenarios] of Object.entries(modules)) {
    if (!Array.isArray(scenarios)) {
      errors.push(`${path}: expected a JSON array`);
      continue;
    }
    for (const s of scenarios) {
      // Validate the envelope (incl. correctOutcome) before anything else.
      const env = ScenarioSchema.safeParse(s);
      if (!env.success) {
        const detail = env.error.issues.map((i) => `${i.path.join('.') || '<root>'}:${i.message}`).join('; ');
        errors.push(`${path} → ${s?.id ?? '<unknown>'}: ${detail}`);
        continue;
      }
      // The ground truth must validate against the task's output schema.
      const schema = SCHEMA_BY_TASK[s.taskTypeId];
      if (!schema) {
        errors.push(`${path} → ${s.id}: no schema for task type "${s.taskTypeId}"`);
        continue;
      }
      const res = schema.safeParse(s.groundTruth);
      if (!res.success) {
        const detail = res.error.issues.map((i) => `${i.path.join('.')}:${i.message}`).join('; ');
        errors.push(`${path} → ${s.id}: ${detail}`);
        continue;
      }
      pool.push(s);
    }
  }

  if (errors.length) {
    // Fail loudly at build/load time — never silently ship a bad pool.
    throw new Error(`[scenarios] invalid scenario pool:\n  - ${errors.join('\n  - ')}`);
  }
  return pool;
}

export const SCENARIOS: TaskScenario[] = loadPool();

/** All task type ids that actually have scenarios in the pool. */
export const poolTaskTypeIds: string[] = Array.from(new Set(SCENARIOS.map((s) => s.taskTypeId)));

/** Count per task type — handy for the lobby. */
export const scenariosByType: Record<string, number> = SCENARIOS.reduce(
  (acc, s) => {
    acc[s.taskTypeId] = (acc[s.taskTypeId] ?? 0) + 1;
    return acc;
  },
  {} as Record<string, number>,
);
