/**
 * Fairness + endless-mode tests for the arrival pump.
 *
 * The fairness contract: every lane gets the SAME scenario at each arrival
 * tick (same taskTypeId, same ground truth, same correctOutcome) — only the
 * silicon differs. nextArrival() draws once and broadcasts identical clones.
 * The pool is drawn randomly forever, so it never exhausts.
 */
import { describe, expect, it } from 'vitest';
import { nextArrival, cloneScenario, MODE_CONFIG } from './arrivalPump';
import { SCENARIOS } from '../data/scenarios';

describe('nextArrival — the fairness contract', () => {
  it('returns one clone per lane id', () => {
    const lanes = ['cerebras', 'gpu', 'gemini'];
    const arrivals = nextArrival(lanes);
    expect(arrivals).toHaveLength(lanes.length);
  });

  it('every lane gets the SAME scenario (same taskTypeId + groundTruth + correctOutcome)', () => {
    const lanes = ['cerebras', 'gpu', 'gemini'];
    const arrivals = nextArrival(lanes);
    for (let i = 1; i < arrivals.length; i++) {
      expect(arrivals[i].taskTypeId, 'same task').toBe(arrivals[0].taskTypeId);
      expect(arrivals[i].groundTruth, 'same ground truth').toEqual(arrivals[0].groundTruth);
      expect(arrivals[i].correctOutcome, 'same correct outcome').toEqual(arrivals[0].correctOutcome);
      expect(arrivals[i].difficulty).toBe(arrivals[0].difficulty);
    }
  });

  it('each clone is an independent instance (distinct id, shared baseId)', () => {
    const [a, b] = nextArrival(['cerebras', 'gpu']);
    expect(a.id).not.toBe(b.id); // distinct per-lane ids
    expect(a.baseId).toBe(b.baseId); // same original pool id
    // mutating one must not affect the other
    (a.groundTruth as Record<string, unknown>).polluted = true;
    expect((b.groundTruth as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('the draw is random/forever — many ticks never throw and stay in the pool', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const [a] = nextArrival(['cerebras']);
      seen.add(a.taskTypeId);
      // every drawn scenario must reference a real pool scenario
      expect(SCENARIOS.some((s) => s.id === a.baseId)).toBe(true);
    }
    // endless drawing should cover many task types
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('cloneScenario', () => {
  it('preserves the source taskTypeId/groundTruth/correctOutcome', () => {
    const base = SCENARIOS[0];
    const c = cloneScenario(base);
    expect(c.taskTypeId).toBe(base.taskTypeId);
    expect(c.groundTruth).toEqual(base.groundTruth);
    expect(c.correctOutcome).toEqual(base.correctOutcome);
    expect(c.baseId).toBe(base.id);
  });
});

describe('MODE_CONFIG presets', () => {
  it('has the requested run windows', () => {
    expect(MODE_CONFIG.short.durationSec).toBe(30);
    expect(MODE_CONFIG.standard.durationSec).toBe(60);
    expect(MODE_CONFIG.extended.durationSec).toBe(300); // 5 min
  });

  it('endless never ends (duration is effectively infinite)', () => {
    expect(MODE_CONFIG.endless.durationSec).toBeGreaterThanOrEqual(Number.MAX_SAFE_INTEGER - 1);
  });

  it('every mode has a positive arrival interval', () => {
    for (const m of Object.keys(MODE_CONFIG) as (keyof typeof MODE_CONFIG)[]) {
      expect(MODE_CONFIG[m].arrival.intervalMs).toBeGreaterThan(0);
    }
  });
});
