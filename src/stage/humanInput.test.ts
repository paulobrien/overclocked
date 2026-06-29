/**
 * humanInput.ts tests — the promise-based bridge between the engine's human
 * lane and the click-to-classify overlay.
 *
 * humanResolver returns a promise per item that resolves when the player
 * submits (or forfeits). subscribe/emit drive the overlay. The module holds a
 * single pending question, so tests isolate via dynamic import + reset.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { TaskScenario, TaskType } from '../shared/contract';

const scenario = {
  id: 'x', taskTypeId: 'manifest-recon', difficulty: 1,
  input: { text: 't' }, groundTruth: { expected: 1, scanned: 1, missing: 0 },
  correctOutcome: { verdict: 'accept' as const, pass: true, summary: '' },
} as TaskScenario;
const task = { id: 'manifest-recon', label: 'Manifest', focusFields: [{ key: 'missing', label: 'Missing' }], humanControls: [{ key: 'missing', label: 'Missing', kind: 'number' as const }] } as unknown as TaskType;

describe('humanInput resolver', () => {
  beforeEach(async () => {
    const mod = await import('./humanInput');
    // clear any pending question by forfeit
    mod.forfeit();
  });

  it('humanResolver returns a promise that resolves on submit', async () => {
    const mod = await import('./humanInput');
    const p = mod.humanResolver(scenario, task);
    expect(mod.getCurrent()).not.toBeNull();
    mod.submit({ missing: 2 });
    expect(await p).toEqual({ missing: 2 });
    expect(mod.getCurrent()).toBeNull();
  });

  it('forfeit resolves the pending question with an empty answer', async () => {
    const mod = await import('./humanInput');
    const p = mod.humanResolver(scenario, task);
    mod.forfeit();
    expect(await p).toEqual({});
  });

  it('subscribe is notified when a question arrives and when it clears', async () => {
    const mod = await import('./humanInput');
    const seen: (typeof mod.getCurrent extends () => infer R ? R : never)[] = [];
    const unsub = mod.subscribe((q) => seen.push(q));
    const p = mod.humanResolver(scenario, task);
    mod.submit({ missing: 0 });
    await p;
    expect(seen.length).toBeGreaterThanOrEqual(1); // at least the arrival
    expect(seen[seen.length - 1]).toBeNull(); // cleared after submit
    unsub();
  });

  it('the 30s auto-timeout default-answer still resolves (wrong) — tested via fake timers', async () => {
    vi.useFakeTimers();
    const mod = await import('./humanInput');
    const p = mod.humanResolver(scenario, task);
    // The resolver auto-submits a default after 30s.
    await vi.advanceTimersByTimeAsync(31000);
    const out = await p;
    expect(out).toBeDefined();
    // default for a number control is a deliberately-wrong sentinel (-1)
    expect((out as Record<string, unknown>).missing).toBe(-1);
    vi.useRealTimers();
  });
});
