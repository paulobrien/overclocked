/**
 * One-off migration: stamp a `correctOutcome` (verdict + pass + summary) onto
 * every scenario in data/scenarios/*.json, derived deterministically from each
 * scenario's ground truth + task type.
 *
 * The verdict comes from the SAME shared `deriveVerdict` the engine stamps with
 * (via `scripts/outcome.ts` → `src/orchestrator/verdict.ts`), so the answer key
 * and the pipeline can't drift. "pass" = whether the case can be resolved at all
 * (true for almost everything; false only for cases where the correct action is
 * to REFUSE — the parcel is rejected, not cleared).
 *
 * Re-runnable (idempotent): overwrites any existing correctOutcome.
 *
 *   npx tsx scripts/add-correct-outcome.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { correctOutcomeFor } from './outcome';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCEN_DIR = resolve(__dirname, '..', 'data', 'scenarios');

let total = 0;
for (const file of readdirSync(SCEN_DIR).filter((f) => f.endsWith('.json'))) {
  const full = join(SCEN_DIR, file);
  const scenarios = JSON.parse(readFileSync(full, 'utf8')) as any[];
  for (const s of scenarios) {
    // pass = false when the correct outcome is to refuse (parcel rejected, not
    // cleared). Everything else can be resolved.
    s.correctOutcome = correctOutcomeFor(s.taskTypeId, s.groundTruth, s.blurb);
    total++;
  }
  writeFileSync(full, JSON.stringify(scenarios, null, 2) + '\n', 'utf8');
  console.log(`✓ ${file} (${scenarios.length})`);
}
console.log(`\nStamped correctOutcome on ${total} scenarios.`);
