/**
 * Human-lane integration test.
 *
 * Proves "users can do tasks" end-to-end: a human lane (a deterministic resolver
 * standing in for a clicking player) runs through the GameEngine, its answers
 * flow through makeHumanClient → the pipeline → grading, and the lane completes
 * items with the answer-key stats populated. This is the path the click-to-
 * classify overlay drives at runtime.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine, type LaneConfig, type LaneRuntime } from '../engine/loop';
import { makeHumanClient } from '../agents/clients';
import { getTaskType } from '../tasks/registry';
import type { TaskScenario } from '../shared/contract';

/** A resolver that "answers" each scenario from its own ground truth — i.e. a
 *  perfect human player. Deterministic + instant so the test is fast. */
function perfectHumanResolver(scenario: TaskScenario) {
  return Promise.resolve({ ...scenario.groundTruth });
}

describe('human lane end-to-end', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a human lane clears items and records correct verdicts (perfect player)', async () => {
    let endResults: Record<string, LaneRuntime> | null = null;
    const lane: LaneConfig = {
      id: 'human',
      name: 'Human',
      // The human client awaits the resolver; with an instant resolver this is fast.
      client: makeHumanClient(perfectHumanResolver as never),
      depth: 'single', // human/mock lanes have no provider → single-agent
    };

    const engine = new GameEngine({ mode: 'blitz', lanes: [lane] }, {
      onLaneUpdate: () => {},
      onTick: () => {},
      onEnd: (res) => { endResults = res; },
    });
    engine.start();
    await vi.advanceTimersByTimeAsync(16000);

    const human = endResults!.human;
    expect(human.items.length).toBeGreaterThan(0);
    // A perfect player matches ground truth → resolved where the case allows it.
    expect(human.cleared).toBeGreaterThan(0);
    // Every item carries the answer-key fields (the focus card / banner depend on these).
    const item = human.items[0];
    expect(item.correctVerdict).toMatch(/^(accept|reroute|hold|refuse)$/);
    expect(typeof item.verdictCorrect).toBe('boolean');
  });

  it('the human resolver receives the scenario + task (so it can answer)', async () => {
    const seen: TaskScenario[] = [];
    const resolver = (scenario: TaskScenario) => {
      seen.push(scenario);
      return Promise.resolve({ ...scenario.groundTruth });
    };
    const lane: LaneConfig = { id: 'human', name: 'Human', client: makeHumanClient(resolver as never), depth: 'single' };
    const engine = new GameEngine({ mode: 'blitz', lanes: [lane] }, {
      onLaneUpdate: () => {}, onTick: () => {}, onEnd: () => {},
    });
    engine.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].groundTruth).toBeDefined();
    expect(getTaskType(seen[0].taskTypeId)).toBeDefined();
  });
});
