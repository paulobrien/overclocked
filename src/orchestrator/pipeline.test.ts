/**
 * pipeline.ts tests — the per-item agent graph orchestrator.
 *
 * The full-depth path calls real model agents (router/checker/escalation), which
 * need a provider — out of scope for offline unit tests (covered by the worker
 * + e2e). Here we exercise the testable surface: single-agent depth (the mock/
 * human path), the verdict decision logic, and the outcome shape.
 */
import { describe, expect, it, vi } from 'vitest';
import { runPipeline } from './pipeline';
import type { AgentClient, TaskScenario, TaskType } from '../shared/contract';
import { getTaskType } from '../tasks/registry';

const task = getTaskType('damage-assessment');
const scenario = {
  id: 'dm-2', taskTypeId: 'damage-assessment', difficulty: 2, adversarial: true,
  input: { text: 'crushed parcel' },
  groundTruth: { damaged: true, damageType: 'crushed', severity: 4, action: 'refuse' },
  correctOutcome: { verdict: 'refuse' as const, pass: false, summary: 'crushed → refuse' },
} as TaskScenario;

/** A mock client that returns a fixed output instantly. */
function mockClient(output: Record<string, unknown>): AgentClient {
  return {
    name: 'mock',
    run: vi.fn(async () => ({
      output, raw: JSON.stringify(output), tokens: 10, latencyMs: 5, tokensPerSec: 1000,
    })),
  };
}

describe('runPipeline — single-agent depth (no provider)', () => {
  it('runs the worker via the client and returns the outcome + trace', async () => {
    const client = mockClient({ ...scenario.groundTruth });
    const onStep = vi.fn();
    const outcome = await runPipeline(scenario, task as TaskType, {
      depth: 'single', client, onStep,
    });
    expect(client.run).toHaveBeenCalled();
    expect(outcome.output).toEqual(scenario.groundTruth);
    expect(outcome.trace.steps.length).toBe(4); // route/work/check/decide
    expect(outcome.trace.verdict).toBeTruthy(); // a verdict was reached
    expect(outcome.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('the verdict reflects a refuse action', async () => {
    const client = mockClient({ damaged: true, damageType: 'crushed', severity: 4, action: 'refuse' });
    const outcome = await runPipeline(scenario, task as TaskType, { depth: 'single', client });
    expect(outcome.trace.verdict).toBe('refuse');
  });

  it('onStep is called as steps transition', async () => {
    const client = mockClient({ ...scenario.groundTruth });
    const onStep = vi.fn();
    await runPipeline(scenario, task as TaskType, { depth: 'single', client, onStep });
    expect(onStep).toHaveBeenCalled();
  });

  it('routes the worker through the client when there is no provider (mock/human path)', async () => {
    // Single depth + no provider must NOT attempt a network call — it uses client.run.
    const client = mockClient({ ...scenario.groundTruth });
    const outcome = await runPipeline(scenario, task as TaskType, { depth: 'single', client });
    expect(client.run).toHaveBeenCalledTimes(1);
    expect(outcome.trace.retries).toBe(0);
    expect(outcome.trace.escalated).toBe(false);
  });
});
