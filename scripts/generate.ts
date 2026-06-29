/**
 * Claude-powered scenario generator (`npm run datagen`).
 *
 * Truth-first synthetic data (§7): feed the task's Zod schema to Claude as the
 * contract, have it author ground-truth-first scenarios across difficulty tiers
 * with adversarial cases salted in, then **Zod-validate every candidate against
 * the task schema** before it's allowed into the pool — so a malformed one is
 * dropped here, never failing the build mid-demo. Valid scenarios get a
 * deterministic `correctOutcome` stamp (shared with add-correct-outcome.ts) and
 * are merged into data/scenarios/<task-id>.json.
 *
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npm run datagen -- <task-id> [count]     # e.g. npm run datagen -- tariff-classification 6
 *   npm run datagen -- --list                # list valid task ids
 *
 * Vision tasks are generated text-only (a faithful description as input.text);
 * attach the real image (run `npm run gen:assets`, set input.imageUrl) by hand.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getTaskType, taskIds, findTaskType } from '../src/tasks/registry';
import { schemaToInstruction } from '../src/tasks/prompt';
import { correctOutcomeFor } from './outcome';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCEN_DIR = resolve(__dirname, '..', 'data', 'scenarios');
const MODEL = process.env.DATAGEN_MODEL || 'claude-opus-4-8';

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function usage(): void {
  console.log(`
Claude scenario generator

  npm run datagen -- <task-id> [count]    Generate [count] (default 6) scenarios
  npm run datagen -- --list               List valid task ids

Requires ANTHROPIC_API_KEY. Override the model with DATAGEN_MODEL (default ${MODEL}).
`);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  usage();
  process.exit(0);
}
if (args[0] === '--list') {
  console.log('Task ids:\n' + taskIds().map((id) => `  ${id}  (${getTaskType(id).modality})`).join('\n'));
  process.exit(0);
}

const taskId = args[0];
const count = Math.max(1, Math.min(20, Number(args[1] ?? 6) || 6));

if (!findTaskType(taskId)) {
  fail(`Unknown task id "${taskId}". Run \`npm run datagen -- --list\` to see valid ids.`);
}
const task = getTaskType(taskId);

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) fail('ANTHROPIC_API_KEY is not set. Export it and re-run (this script calls the Claude API).');

// --- The generation schema: one envelope per task, with groundTruth = the
//     task's own output schema. Structured output forces a schema-valid shape. ---
const GenScenario = z.object({
  input_text: z
    .string()
    .describe('The exact text a warehouse agent reads to perform the task. Self-contained; resolvable to the groundTruth below.'),
  documents: z
    .array(z.string())
    .optional()
    .describe('For document tasks ONLY: the document body/bodies (invoice, manifest, BOL, etc.).'),
  difficulty: z.number().describe('1 = easy, 2 = medium, 3 = hard.'),
  adversarial: z.boolean().describe('true for a deliberately tricky/deceptive/edge case (undervaluation, mislabel, tamper, counterfeit, missing field).'),
  blurb: z.string().min(1).describe('A short 2-6 word human label for this case (non-empty).'),
  groundTruth: task.outputSchema.describe('The correct answer, decided FIRST. Must satisfy the task output schema exactly.'),
});

/** Tolerantly pull a JSON object out of the model's text (strips ``` fences,
 *  falls back to the first balanced {...} block). */
function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

type ScenarioFile = Array<{
  id: string;
  taskTypeId: string;
  difficulty: 1 | 2 | 3;
  input: { text?: string; imageUrl?: string; documents?: string[] };
  groundTruth: Record<string, unknown>;
  adversarial?: boolean;
  blurb?: string;
  correctOutcome: ReturnType<typeof correctOutcomeFor>;
}>;

function loadExisting(file: string): ScenarioFile {
  if (!existsSync(file)) return [];
  try {
    const arr = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Continue the file's existing id scheme (prefix + max number). */
function makeIdAllocator(existing: ScenarioFile): () => string {
  const re = /^(.*?)-(\d+)$/;
  const prefixCounts: Record<string, number> = {};
  let max = 0;
  for (const s of existing) {
    const m = re.exec(s.id ?? '');
    if (m) {
      prefixCounts[m[1]] = (prefixCounts[m[1]] ?? 0) + 1;
      max = Math.max(max, Number(m[2]));
    }
  }
  const prefix =
    Object.entries(prefixCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    taskId.split('-').map((p) => p[0]).join('');
  const taken = new Set(existing.map((s) => s.id));
  let n = max;
  return () => {
    let id: string;
    do {
      n += 1;
      id = `${prefix}-${n}`;
    } while (taken.has(id));
    taken.add(id);
    return id;
  };
}

async function main(): Promise<void> {
  const file = join(SCEN_DIR, `${taskId}.json`);
  const existing = loadExisting(file);

  if (task.modality === 'vision') {
    console.warn(
      `⚠ "${taskId}" is a VISION task. Scenarios will be generated text-only (a description as input.text). ` +
        `Run \`npm run gen:assets\` and set each scenario's input.imageUrl by hand for the real vision demo.`,
    );
  }

  // Show the model the existing cases so it produces genuinely new, distinct ones.
  const examples = existing
    .slice(0, 12)
    .map((s) => `- ${s.blurb ?? s.id}: ${JSON.stringify(s.groundTruth)}`)
    .join('\n');

  const modalityHint =
    task.modality === 'document'
      ? 'Put the document body in `documents` (one or more strings). `input_text` may be a one-line instruction.'
      : task.modality === 'vision'
        ? 'Put a faithful textual DESCRIPTION of the photo/label in `input_text` so the groundTruth is derivable. Leave `documents` empty.'
        : 'Put the agent input in `input_text`. Leave `documents` empty.';

  const system =
    'You author SYNTHETIC scenarios for a warehouse-sortation AI benchmark. Work TRUTH-FIRST: decide the correct ' +
    '`groundTruth` first, then write an `input_text` a competent agent could resolve to exactly that groundTruth. ' +
    'Make them realistic and varied (real carriers, countries, product types, edge formats). Spread difficulty ' +
    '1–3 and make ~30% adversarial (deceptive/edge: undervaluation, mislabeled hazmat, counterfeit goods, tampered ' +
    'seals, missing fields). Every scenario must be self-contained and DISTINCT from the provided examples.';

  const user = [
    `Task: ${task.label} (id: ${taskId}, modality: ${task.modality}).`,
    '',
    'Each scenario\'s `groundTruth` MUST satisfy this exact shape:',
    schemaToInstruction(task.outputSchema),
    '',
    modalityHint,
    '',
    existing.length ? `Existing cases (produce NEW ones, do not repeat these):\n${examples}` : '(No existing cases yet.)',
    '',
    `Generate exactly ${count} new, distinct scenarios.`,
    '',
    'Respond with ONLY a JSON object (no prose, no markdown fences) of this form:',
    '{"scenarios":[{"input_text":string,"documents"?:string[],"difficulty":1|2|3,"adversarial":boolean,"blurb":string,"groundTruth":{…}}]}',
  ].join('\n');

  const client = new Anthropic({ apiKey });
  console.log(`Generating ${count} "${taskId}" scenarios with ${MODEL}…`);

  // The project's zod is v3-shaped, which the SDK's structured-output helper
  // (zod v4 only) can't consume — so we ask for JSON and tolerantly parse +
  // Zod-validate it ourselves, mirroring the app's parseOutput contract.
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  const obj = extractJson(text);
  const rawList = (obj as { scenarios?: unknown })?.scenarios;
  if (!Array.isArray(rawList)) {
    fail(`Model output had no "scenarios" array (stop_reason: ${res.stop_reason}).`);
  }

  const allocId = makeIdAllocator(existing);
  const seen = new Set(existing.map((s) => JSON.stringify(s.groundTruth)));
  const added: ScenarioFile = [];
  let dropped = 0;

  // Validate each scenario individually so a couple of malformed ones don't sink
  // the whole batch.
  const candidates: z.infer<typeof GenScenario>[] = [];
  for (const item of rawList as unknown[]) {
    const r = GenScenario.safeParse(item);
    if (r.success) candidates.push(r.data);
    else dropped += 1;
  }

  for (const g of candidates) {
    // Re-validate the ground truth against the task schema (defence in depth).
    const gt = task.outputSchema.safeParse(g.groundTruth);
    if (!gt.success) {
      dropped += 1;
      continue;
    }
    const key = JSON.stringify(gt.data);
    if (seen.has(key)) {
      dropped += 1; // duplicate of an existing/already-added case
      continue;
    }
    seen.add(key);

    const difficulty = (Math.min(3, Math.max(1, Math.round(g.difficulty))) || 1) as 1 | 2 | 3;
    const input: { text?: string; documents?: string[] } =
      task.modality === 'document'
        ? { documents: g.documents?.length ? g.documents : [g.input_text] }
        : { text: g.input_text };

    const groundTruth = gt.data as Record<string, unknown>;
    added.push({
      id: allocId(),
      taskTypeId: taskId,
      difficulty,
      input,
      groundTruth,
      adversarial: g.adversarial || undefined,
      blurb: g.blurb,
      correctOutcome: correctOutcomeFor(taskId, groundTruth, g.blurb),
    });
  }

  if (added.length === 0) {
    fail(`No valid new scenarios produced (${dropped} dropped as invalid/duplicate). Try re-running.`);
  }

  const merged = [...existing, ...added];
  writeFileSync(file, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  console.log(`\n✓ Added ${added.length} scenario(s) to ${taskId}.json (was ${existing.length}, now ${merged.length}).`);
  if (dropped) console.log(`  (${dropped} dropped as invalid or duplicate.)`);
  for (const s of added) console.log(`  + ${s.id}: ${s.blurb ?? ''} → ${s.correctOutcome.verdict}`);
  console.log('\nNext: run `npm test` (or `npm run build`) to validate the whole pool loads.');
  if (task.modality === 'vision') console.log('Vision: attach images (gen:assets + input.imageUrl) before the live vision demo.');
}

main().catch((err) => {
  // Surface a clean message; the SDK throws typed errors (auth, rate limit, etc.).
  fail(err instanceof Error ? err.message : String(err));
});
