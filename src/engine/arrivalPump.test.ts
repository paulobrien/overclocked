/**
 * Arrival pump tests.
 *
 * drawScenario is random, so we stub Math.random to make the weighted draw
 * deterministic and assert: difficulty weighting works, adversarial bias is
 * respected, and seedQueue returns the right count. MODE_CONFIG durations are
 * also asserted (the timer + sudden-death ramp depend on them).
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { drawScenario, seedQueue, MODE_CONFIG } from './arrivalPump';
import { SCENARIOS } from '../data/scenarios';

describe('MODE_CONFIG', () => {
  it('every mode has a duration and arrival config', () => {
    for (const m of ['blitz', 'short', 'standard', 'sudden-death'] as const) {
      const c = MODE_CONFIG[m];
      expect(c.durationSec).toBeGreaterThan(0);
      expect(c.arrival.intervalMs).toBeGreaterThan(0);
      expect(c.arrival.maxQueue).toBeGreaterThan(0);
    }
  });

  it('durations are ordered: blitz < short < standard < sudden-death', () => {
    expect(MODE_CONFIG.blitz.durationSec).toBeLessThan(MODE_CONFIG.short.durationSec);
    expect(MODE_CONFIG.short.durationSec).toBeLessThan(MODE_CONFIG.standard.durationSec);
    expect(MODE_CONFIG.standard.durationSec).toBeLessThan(MODE_CONFIG['sudden-death'].durationSec);
  });
});

describe('drawScenario', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a scenario from the pool', () => {
    const s = drawScenario();
    expect(SCENARIOS.map((x) => x.id)).toContain(s.id);
  });

  it('picks an adversarial scenario when the first roll is below the bias', () => {
    // First call decides adversarial (<0.22); second selects within the pool.
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => [0.1, 0.5][i++] ?? 0.5);
    const s = drawScenario();
    expect(s.adversarial).toBeTruthy();
  });

  it('weights toward difficulty 1 (the heaviest weight) when not adversarial', () => {
    // adversarial roll = 0.9 (no); selection roll = 0.0 → first (lowest-difficulty) item
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => [0.9, 0.0][i++] ?? 0.9);
    const s = drawScenario();
    // The non-adversarial pool is difficulty-weighted; a 0.0 roll lands on the
    // first difficulty-1 scenario in array order.
    expect(s.difficulty).toBe(1);
  });

  it('over many draws, every difficulty tier appears', () => {
    const diffs = new Set<number>();
    for (let i = 0; i < 400; i++) diffs.add(drawScenario().difficulty);
    expect(diffs.has(1)).toBe(true);
    expect(diffs.has(2)).toBe(true);
    expect(diffs.has(3)).toBe(true);
  });

  it('over many draws, adversarial cases appear at a meaningful rate', () => {
    // The bias (~22%) guarantees a floor, but adversarial items can also be
    // drawn from the main weighted pool, so the true rate exceeds the bias.
    // We assert a stable floor + an upper sanity bound only.
    let adv = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) if (drawScenario().adversarial) adv++;
    expect(adv / N).toBeGreaterThan(0.15);
    expect(adv / N).toBeLessThan(0.6);
  });
});

describe('seedQueue', () => {
  it('returns n scenarios', () => {
    expect(seedQueue(5).length).toBe(5);
    expect(seedQueue(0).length).toBe(0);
  });

  it('each seeded scenario is valid (has groundTruth + correctOutcome)', () => {
    for (const s of seedQueue(10)) {
      expect(s.groundTruth).toBeDefined();
      expect(s.correctOutcome).toBeDefined();
    }
  });
});
