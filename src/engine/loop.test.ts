/**
 * End-to-end engine integration test.
 *
 * Runs a FULL mock race through GameEngine — arrival pump → per-item pipeline
 * → grading → scoring — to completion, with no network. Uses fake timers to
 * fast-forward the 15s blitz window and a near-zero-latency mock profile so
 * items clear quickly. Asserts the loop ends, lanes accumulate scores, and the
 * answer-key stats (resolved / verdictCorrect) are populated.
 *
 * This is the test that proves the whole architecture hangs together: if any
 * layer (pump, pipeline, grader, scoring, store contract) is broken, the race
 * never completes or the numbers are wrong.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine, OFFLINE_AFTER_FAILURES, type LaneConfig, type LaneRuntime } from './loop';
import { makeMockClient, type MockProfile } from '../agents/clients';

const instant: MockProfile = { stepLatency: [0, 1], tokensPerSec: 1000, errorRate: 0 };

function buildLanes(): LaneConfig[] {
  return [
    { id: 'cerebras', name: 'Cerebras', client: makeMockClient('Cerebras', instant), depth: 'single' },
    { id: 'gpu', name: 'Challenger', client: makeMockClient('Challenger', instant), depth: 'single' },
  ];
}

describe('GameEngine end-to-end (mock race)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // deterministic draws, no corruption
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs a blitz race to completion, scoring both lanes', async () => {
    const updates: Record<string, LaneRuntime> = {};
    let ended = false;
    let endTime = -1;
    let endResults: Record<string, LaneRuntime> | null = null;

    const engine = new GameEngine(
      { mode: 'blitz', lanes: buildLanes() },
      {
        onLaneUpdate: (id, rt) => {
          updates[id] = rt;
        },
        onTick: (t) => {
          endTime = t;
        },
        onEnd: (res) => {
          ended = true;
          endResults = res;
        },
      },
    );
    engine.start();

    // Fast-forward past the 15s blitz duration + a margin for trailing timers.
    await vi.advanceTimersByTimeAsync(16000);

    expect(ended).toBe(true);
    expect(endTime).toBe(0);
    expect(endResults).not.toBeNull();
    const cer = endResults!.cerebras;
    const gpu = endResults!.gpu;
    expect(cer).toBeDefined();
    expect(gpu).toBeDefined();
    // Both lanes should have cleared at least one item (instant latency, 15s window).
    expect(cer.cleared + cer.items.length).toBeGreaterThan(0);
    // Scores are non-negative integers.
    expect(cer.score).toBeGreaterThanOrEqual(0);
    expect(gpu.score).toBeGreaterThanOrEqual(0);
  });

  it('emits lane updates as items process (the store subscribes to these)', async () => {
    let updateCount = 0;
    const engine = new GameEngine(
      { mode: 'blitz', lanes: buildLanes() },
      {
        onLaneUpdate: () => {
          updateCount++;
        },
        onTick: () => {},
        onEnd: () => {},
      },
    );
    engine.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(updateCount).toBeGreaterThan(0);
    engine.stop();
  });

  it('stop() halts the loop (no further ticks/end)', async () => {
    let ended = false;
    const engine = new GameEngine(
      { mode: 'blitz', lanes: buildLanes() },
      {
        onLaneUpdate: () => {},
        onTick: () => {},
        onEnd: () => {
          ended = true;
        },
      },
    );
    engine.start();
    await vi.advanceTimersByTimeAsync(2000);
    engine.stop();
    await vi.advanceTimersByTimeAsync(20000);
    expect(ended).toBe(false);
  });

  it('each scored item carries the answer-key fields (correctVerdict, verdictCorrect, resolved)', async () => {
    let endResults: Record<string, LaneRuntime> | null = null;
    const engine = new GameEngine(
      { mode: 'blitz', lanes: buildLanes() },
      {
        onLaneUpdate: () => {},
        onTick: () => {},
        onEnd: (res) => {
          endResults = res;
        },
      },
    );
    engine.start();
    await vi.advanceTimersByTimeAsync(16000);

    const items = endResults!.cerebras.items;
    expect(items.length).toBeGreaterThan(0);
    const item = items[0];
    expect(item.correctVerdict).toMatch(/^(accept|reroute|hold|refuse)$/);
    expect(typeof item.verdictCorrect).toBe('boolean');
    expect(typeof item.resolved).toBe('boolean');
  });


  it('endless mode never ends on its own (no onEnd after a long window)', async () => {
    let ended = false;
    const engine = new GameEngine(
      { mode: 'endless', lanes: buildLanes() },
      {
        onLaneUpdate: () => {},
        onTick: () => {},
        onEnd: () => { ended = true; },
      },
    );
    engine.start();
    // Fast-forward well past any finite window — endless must not fire onEnd.
    await vi.advanceTimersByTimeAsync(400000);
    expect(ended).toBe(false);
    engine.stop();
  });

  it('surfaces a provider error on the focus card instead of a fake verdict', async () => {
    // A client whose worker call always throws (e.g. bad model id → 502).
    const throwing = {
      run: async () => {
        throw new Error('upstream 502: {"error":"upstream_error"}');
      },
    } as unknown as LaneConfig['client'];
    let sawError: string | undefined;
    let sawFakeVerdictWithError = false;
    const engine = new GameEngine(
      { mode: 'blitz', lanes: [{ id: 'cerebras', name: 'Cerebras', client: throwing, depth: 'single' }] },
      {
        onLaneUpdate: (_id, rt) => {
          if (rt.focus?.error) {
            sawError = rt.focus.error;
            if (rt.focus.verdict) sawFakeVerdictWithError = true;
          }
        },
        onTick: () => {},
        onEnd: () => {},
      },
    );
    engine.start();
    await vi.advanceTimersByTimeAsync(3000);
    engine.stop();
    expect(sawError).toBeDefined();
    expect(sawError).toMatch(/provider error/i);
    // The error focus must NOT also carry a (misleading) verdict stamp.
    expect(sawFakeVerdictWithError).toBe(false);
  });

  it('trips a failing lane OFFLINE and stops hammering the provider', async () => {
    let calls = 0;
    const throwing = {
      run: async () => {
        calls++;
        throw new Error('upstream 502: {"error":"upstream_error"}');
      },
    } as unknown as LaneConfig['client'];
    let wentOffline = false;
    const engine = new GameEngine(
      { mode: 'blitz', lanes: [{ id: 'cerebras', name: 'Cerebras', client: throwing, depth: 'single' }] },
      {
        onLaneUpdate: (_id, rt) => {
          if (rt.offline) wentOffline = true;
        },
        onTick: () => {},
        onEnd: () => {},
      },
    );
    engine.start();
    await vi.advanceTimersByTimeAsync(4000);
    const callsAtTrip = calls;
    // Keep time running — an offline lane must make NO further calls.
    await vi.advanceTimersByTimeAsync(4000);
    engine.stop();
    expect(wentOffline).toBe(true);
    expect(calls).toBe(callsAtTrip); // no hammering after the trip
    expect(calls).toBeLessThanOrEqual(OFFLINE_AFTER_FAILURES + 1); // gave up fast, not hundreds
  });

  it('paces arrivals off the fastest lane — the leader never backlogs, the laggard does', async () => {
    const fast: MockProfile = { stepLatency: [0, 1], tokensPerSec: 1000, errorRate: 0 };
    const slow: MockProfile = { stepLatency: [4000, 4000], tokensPerSec: 20, errorRate: 0 };
    let fastRt: LaneRuntime | undefined;
    let slowRt: LaneRuntime | undefined;
    const engine = new GameEngine(
      {
        mode: 'standard',
        lanes: [
          { id: 'cerebras', name: 'Cerebras', client: makeMockClient('Cerebras', fast), depth: 'single' },
          { id: 'gpu', name: 'Challenger', client: makeMockClient('Challenger', slow), depth: 'single' },
        ],
      },
      {
        onLaneUpdate: (id, rt) => {
          if (id === 'cerebras') fastRt = rt;
          else slowRt = rt;
        },
        onTick: () => {},
        onEnd: () => {},
      },
    );
    engine.start();
    await vi.advanceTimersByTimeAsync(45000);
    engine.stop();
    // The fast lane sets the pace, so it stays drained — no backlog.
    expect(fastRt!.backlog).toBe(0);
    // The slow lane gets the same arrivals but can't keep up — it falls behind.
    expect(slowRt!.backlog).toBeGreaterThan(0);
  });

  it('fairness: both lanes receive the same number of items (a fair race converges)', async () => {
    let endResults: Record<string, LaneRuntime> | null = null;
    const engine = new GameEngine(
      { mode: 'blitz', lanes: buildLanes() },
      {
        onLaneUpdate: () => {},
        onTick: () => {},
        onEnd: (res) => { endResults = res; },
      },
    );
    engine.start();
    await vi.advanceTimersByTimeAsync(16000);

    // Identical mock profiles + identical scenario stream ⇒ both lanes process
    // the same count (the per-item content equality is proven in fairness.test.ts
    // via nextArrival; here we confirm the engine actually balances them).
    const a = endResults!.cerebras.items.length;
    const b = endResults!.gpu.items.length;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });
});
