/**
 * Grader + scenario-pool tests (Vitest).
 *
 * Two responsibilities:
 *  1. Prove the grading contract holds per task type — correct = full, wrong =
 *     0, partial is field-proportional, comparison is tolerant.
 *  2. Prove the ENTIRE shipped scenario pool is schema-valid and every scenario
 *     references a known task (§7 truth-first discipline: a malformed scenario
 *     must fail at build/test time, never mid-demo).
 */
import { describe, expect, it } from 'vitest';
import { GRADERS } from './graders';
import { SCHEMA_BY_TASK } from './schemas';

// ─────────────────────────── Grader contract tests ─────────────────────────

describe('label-parse grader', () => {
  const truth = { carrier: 'DHL', trackingNumber: 'JD014299998834', serviceLevel: 'EXPRESS', address: '12 Baker Street London W1U 4AF' };
  const grade = GRADERS['label-parse'];

  it('scores full on an exact correct answer', () => {
    const r = grade({ ...truth }, truth, 1);
    expect(r.correct).toBe(true);
    expect(r.partial).toBe(1);
    expect(r.scoreDelta).toBe(100);
  });

  it('is tolerant of case and whitespace', () => {
    const r = grade(
      { carrier: 'dhl', trackingNumber: 'jd 0142 9999 8834', serviceLevel: 'express', address: '12 baker street london w1u 4af' },
      truth,
      1,
    );
    expect(r.correct).toBe(true);
  });

  it('scores zero delta when everything is wrong', () => {
    const r = grade({ carrier: 'x', trackingNumber: 'y', serviceLevel: 'z', address: 'w' }, truth, 1);
    expect(r.scoreDelta).toBe(0);
    expect(r.correct).toBe(false);
  });

  it('gives partial credit for some fields', () => {
    const r = grade({ carrier: 'DHL', trackingNumber: 'wrong', serviceLevel: 'EXPRESS', address: 'wrong' }, truth, 1);
    expect(r.correct).toBe(false);
    expect(r.partial).toBeGreaterThan(0);
    expect(r.partial).toBeLessThan(1);
  });
});

describe('damage-assessment grader (action weighted ×2)', () => {
  const truth = { damaged: true, damageType: 'crushed', severity: 4, action: 'refuse' };
  const grade = GRADERS['damage-assessment'];

  it('scores full when all correct', () => {
    const r = grade({ ...truth }, truth, 2);
    expect(r.correct).toBe(true);
    expect(r.scoreDelta).toBe(200);
  });

  it('penalizes a wrong action harder than a wrong type', () => {
    const wrongType = grade({ damaged: true, damageType: 'wet', severity: 4, action: 'refuse' }, truth, 2);
    const wrongAction = grade({ damaged: true, damageType: 'crushed', severity: 4, action: 'accept' }, truth, 2);
    expect(wrongAction.scoreDelta).toBeLessThan(wrongType.scoreDelta);
  });
});

describe('manifest grader (numeric exactness)', () => {
  const truth = { expected: 48, scanned: 46, missing: 2 };
  const grade = GRADERS['manifest-recon'];

  it('scores full on exact numbers', () => {
    expect(grade({ expected: 48, scanned: 46, missing: 2 }, truth, 1).correct).toBe(true);
  });
  it('fails on wrong missing count', () => {
    expect(grade({ expected: 48, scanned: 46, missing: 5 }, truth, 1).correct).toBe(false);
  });
});

describe('dim-weight grader (tolerance ±1cm/0.5kg)', () => {
  const truth = { declaredLengthCm: 30, declaredWidthCm: 20, declaredHeightCm: 15, declaredWeightKg: 2.5, mismatch: false };
  const grade = GRADERS['dim-weight'];

  it('scores full within tolerance', () => {
    expect(grade({ declaredLengthCm: 30.5, declaredWidthCm: 20, declaredHeightCm: 15, declaredWeightKg: 2.4, mismatch: false }, truth, 2).correct).toBe(true);
  });
  it('flags a wrong mismatch decision', () => {
    expect(grade({ declaredLengthCm: 30, declaredWidthCm: 20, declaredHeightCm: 15, declaredWeightKg: 2.5, mismatch: true }, truth, 2).correct).toBe(false);
  });
});

describe('pallet-check grader', () => {
  const truth = { cartonCount: 24, overhang: false, stackingViolation: false };
  it('catches an overhang the worker missed', () => {
    const r = GRADERS['pallet-check']({ cartonCount: 24, overhang: true, stackingViolation: false }, truth, 2);
    expect(r.correct).toBe(false);
  });
});

describe('sla-risk grader (ETA ±2h)', () => {
  const truth = { status: 'at-risk', etaHours: 22, cause: 'weather' };
  it('scores full within ETA tolerance', () => {
    expect(GRADERS['sla-risk']({ status: 'at-risk', etaHours: 23, cause: 'weather' }, truth, 2).correct).toBe(true);
  });
  it('fails on a wrong status', () => {
    expect(GRADERS['sla-risk']({ status: 'on-time', etaHours: 22, cause: 'weather' }, truth, 2).correct).toBe(false);
  });
});

describe('restricted-screening grader', () => {
  it('requires both status and reason', () => {
    const truth = { status: 'prohibited', reason: 'counterfeit-goods' };
    expect(GRADERS['restricted-screening']({ status: 'prohibited', reason: 'wrong' }, truth, 3).correct).toBe(false);
    expect(GRADERS['restricted-screening']({ status: 'prohibited', reason: 'counterfeit-goods' }, truth, 3).correct).toBe(true);
  });
});

describe('docs-completeness grader', () => {
  const truth = { bolPresent: true, cooPresent: false, packingListPresent: true, complete: false };
  it('scores full when every present/absent doc matches', () => {
    expect(GRADERS['docs-completeness']({ bolPresent: true, cooPresent: false, packingListPresent: true, complete: false }, truth, 1).correct).toBe(true);
  });
  it('fails when a missing doc is reported present', () => {
    expect(GRADERS['docs-completeness']({ bolPresent: true, cooPresent: true, packingListPresent: true, complete: true }, truth, 1).correct).toBe(false);
  });
});

describe('carrier-select grader', () => {
  it('matches the least-cost choice', () => {
    const truth = { carrier: 'FedEx', service: 'PRIORITY', cost: 'GBP 19.50' };
    expect(GRADERS['carrier-select']({ carrier: 'fedex', service: 'priority', cost: 'gbp 19.50' }, truth, 2).correct).toBe(true);
  });
});

describe('every shipped grader handles a wrong answer with scoreDelta 0', () => {
  // Smoke-test all 17 graders: a totally-wrong output must never score points.
  it.each(Object.keys(GRADERS))('%s yields 0 on an empty/wrong answer', (id) => {
    const truth = sampleTruth(id);
    const r = GRADERS[id]({}, truth, 2);
    expect(r.scoreDelta).toBe(0);
    expect(r.correct).toBe(false);
  });
});

// ─────────────────────────── Pool validation tests ─────────────────────────

describe('scenario pool validity (§7)', () => {
  it('every scenario output validates against its task schema', async () => {
    const { SCENARIOS } = await import('../data/scenarios');
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(80);
    for (const s of SCENARIOS) {
      const schema = SCHEMA_BY_TASK[s.taskTypeId];
      expect(schema, `schema for ${s.taskTypeId}`).toBeDefined();
      const res = schema.safeParse(s.groundTruth);
      expect(res.success, `${s.id}: ${res.success ? '' : JSON.stringify(res.error.issues.map((i) => i.path + ':' + i.message))}`).toBe(true);
    }
  });

  it('every scenario references a known task type', async () => {
    const { SCENARIOS } = await import('../data/scenarios');
    const { taskIds } = await import('./registry');
    const ids = taskIds();
    for (const s of SCENARIOS) {
      expect(ids, `${s.id} → ${s.taskTypeId}`).toContain(s.taskTypeId);
    }
  });

  it('every task type has a healthy spread of scenarios and at least one adversarial case where relevant', async () => {
    const { SCENARIOS, scenariosByType } = await import('../data/scenarios');
    const { taskIds } = await import('./registry');
    for (const id of taskIds()) {
      const n = scenariosByType[id] ?? 0;
      expect(n, `${id} should have ≥4 scenarios`).toBeGreaterThanOrEqual(4);
    }
    // Sanity: pool includes adversarial highlight cases.
    const adversarial = SCENARIOS.filter((s) => s.adversarial);
    expect(adversarial.length).toBeGreaterThanOrEqual(8);
  });

  it('difficulty is spread across tiers (no round is all-difficulty-1)', async () => {
    const { SCENARIOS } = await import('../data/scenarios');
    const byDiff = { 1: 0, 2: 0, 3: 0 };
    for (const s of SCENARIOS) byDiff[s.difficulty as 1 | 2 | 3]++;
    expect(byDiff[1]).toBeGreaterThan(0);
    expect(byDiff[2]).toBeGreaterThan(0);
    expect(byDiff[3]).toBeGreaterThan(0);
  });
});

describe('correct-outcome metadata (answer key)', () => {
  it('every scenario carries a valid correctOutcome { verdict, pass, summary }', async () => {
    const { SCENARIOS } = await import('../data/scenarios');
    for (const s of SCENARIOS) {
      expect(s.correctOutcome, `${s.id} missing correctOutcome`).toBeDefined();
      expect(s.correctOutcome.verdict, `${s.id} bad verdict`).toMatch(/^(accept|reroute|hold|refuse)$/);
      expect(typeof s.correctOutcome.pass, `${s.id} pass not boolean`).toBe('boolean');
      expect(s.correctOutcome.summary.length, `${s.id} empty summary`).toBeGreaterThan(0);
    }
  });

  it('every refused case is marked pass=false (a refused parcel is not cleared)', async () => {
    const { SCENARIOS } = await import('../data/scenarios');
    const refused = SCENARIOS.filter((s) => s.correctOutcome.verdict === 'refuse');
    expect(refused.length).toBeGreaterThan(0);
    for (const s of refused) {
      expect(s.correctOutcome.pass, `${s.id} refuse should be pass=false`).toBe(false);
    }
  });

  it('the verdicts are spread across all four operational outcomes', async () => {
    const { SCENARIOS } = await import('../data/scenarios');
    const counts = { accept: 0, reroute: 0, hold: 0, refuse: 0 };
    for (const s of SCENARIOS) counts[s.correctOutcome.verdict]++;
    // No outcome should be absent — the pool exercises all four decisions.
    expect(counts.accept).toBeGreaterThan(0);
    expect(counts.reroute).toBeGreaterThan(0);
    expect(counts.hold).toBeGreaterThan(0);
    expect(counts.refuse).toBeGreaterThan(0);
  });
});

/** A minimal valid-ish truth per task id, for the wrong-answer smoke test. */
function sampleTruth(id: string): Record<string, unknown> {
  const samples: Record<string, Record<string, unknown>> = {
    'label-parse': { carrier: 'DHL', trackingNumber: 'X', serviceLevel: 'EXPRESS', address: 'A' },
    'damage-assessment': { damaged: true, damageType: 'crushed', severity: 3, action: 'refuse' },
    'hazmat-detection': { unClass: '3', compliant: true, labelMissing: false },
    'customs-invoice': { hsCode: '0000.00', declaredValue: 'USD 1', countryOfOrigin: 'US' },
    'seal-tamper': { sealIntact: true, tampered: false, flag: 'clear' },
    'manifest-recon': { expected: 1, scanned: 1, missing: 0 },
    'tariff-classification': { hsCode: '0000.00', dutyCategory: 'standard' },
    'exception-routing': { category: 'x', queue: 'y', priority: 'P2' },
    'dim-weight': { declaredLengthCm: 10, declaredWidthCm: 10, declaredHeightCm: 10, declaredWeightKg: 1, mismatch: false },
    'pallet-check': { cartonCount: 10, overhang: false, stackingViolation: false },
    'address-validation': { canonical: 'A', deliverable: true, zone: 'EU-1' },
    'carrier-select': { carrier: 'X', service: 'Y', cost: 'GBP 1' },
    'sla-risk': { status: 'on-time', etaHours: 1, cause: 'none' },
    'rma-disposition': { disposition: 'restock', reason: 'ok' },
    'restricted-screening': { status: 'allowed', reason: 'ok' },
    'docs-completeness': { bolPresent: true, cooPresent: true, packingListPresent: true, complete: true },
    'handwritten-label': { name: 'A', addressLine: 'B', postcode: 'C' },
    'conveyor-incident': { event: 'jam', action: 'reroute' },
  };
  return samples[id] ?? {};
}
