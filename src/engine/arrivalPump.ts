/**
 * Arrival pump — releases scenarios onto the queue at a controlled rate (§3).
 *
 * It draws from the baked pool, weighted by difficulty (so no round is ten
 * label-scans in a row), salts in adversarial highlight cases, and randomizes
 * so every run differs but stays gradeable. The arrival rate ramps in Sudden
 * Death mode until one handler drowns.
 */
import { SCENARIOS } from '../data/scenarios';
import type { TaskScenario } from '../shared/contract';

export type Mode = 'blitz' | 'short' | 'standard' | 'extended' | 'endless' | 'sudden-death';

export interface ArrivalConfig {
  /** ms between arrivals per lane. Lower = faster belt. */
  intervalMs: number;
  /** Cap on backlog before arrivals just stack (visual jam). */
  maxQueue: number;
}

/**
 * Per-mode config. Each lane pulls from the SAME shared scenario stream, so the
 * tasks are identical across lanes — only the silicon differs. `endless` runs
 * forever (no timer) for open-ended demos; the others are fixed windows.
 */
export const MODE_CONFIG: Record<Mode, { durationSec: number; arrival: ArrivalConfig }> = {
  blitz: { durationSec: 15, arrival: { intervalMs: 900, maxQueue: 12 } },
  short: { durationSec: 30, arrival: { intervalMs: 1300, maxQueue: 12 } },
  standard: { durationSec: 60, arrival: { intervalMs: 1500, maxQueue: 14 } },
  extended: { durationSec: 300, arrival: { intervalMs: 1600, maxQueue: 16 } }, // 5 minutes
  endless: { durationSec: Number.MAX_SAFE_INTEGER, arrival: { intervalMs: 1500, maxQueue: 16 } },
  'sudden-death': { durationSec: 90, arrival: { intervalMs: 1400, maxQueue: 18 } },
};

const DIFFICULTY_WEIGHT: Record<number, number> = { 1: 5, 2: 3, 3: 2 };
const ADVERSARIAL_BIAS = 0.22; // ~1 in 5 should be a highlight case

/** Weighted random pick from the pool. */
export function drawScenario(): TaskScenario {
  // First decide adversarial vs normal.
  const wantAdversarial = Math.random() < ADVERSARIAL_BIAS;
  let pool = SCENARIOS;
  if (wantAdversarial) {
    const adv = SCENARIOS.filter((s) => s.adversarial);
    if (adv.length) pool = adv;
  }
  const weights = pool.map((s) => DIFFICULTY_WEIGHT[s.difficulty] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Deep-clone a scenario with a fresh per-instance id, so each lane gets its own
 *  independent copy of the SAME task (no shared mutable state). The original id
 *  is preserved as `baseId` for fairness tracing; `id` is unique per lane-instance. */
let cloneSeq = 0;
export function cloneScenario(base: TaskScenario): TaskScenario {
  cloneSeq++;
  return {
    ...base,
    id: `${base.id}#${cloneSeq}`,
    // keep groundTruth/correctOutcome by value (they're plain JSON); attach baseId
    baseId: base.id,
    input: { ...base.input },
    groundTruth: { ...base.groundTruth },
    correctOutcome: { ...base.correctOutcome },
  } as TaskScenario;
}

/**
 * Draw the NEXT scenario for an arrival tick — ONE draw, broadcast to every
 * lane as its own clone. This is the fairness contract: every lane sees the
 * identical task at the identical moment, so the only variable is the silicon.
 * Returns one clone per lane id, in order.
 */
export function nextArrival(laneIds: string[]): TaskScenario[] {
  const base = drawScenario();
  return laneIds.map(() => cloneScenario(base));
}

/** A fresh queue of N scenarios to seed a lane at start. */
export function seedQueue(n: number): TaskScenario[] {
  return Array.from({ length: n }, () => drawScenario());
}
