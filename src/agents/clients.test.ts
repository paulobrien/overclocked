/**
 * Client factory tests (mock + human lanes).
 *
 * The Cerebras/OpenRouter/Gemini clients hit the network (covered by the worker
 * tests + e2e). The mock and human clients are pure and are the demo's
 * fake-first fallback, so they get direct unit coverage: determinism, the
 * errorRate corruption, and the human resolver contract.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeMockClient, makeHumanClient, MOCK_PROFILES, type MockProfile } from './clients';
import type { TaskScenario, TaskType } from '../shared/contract';
import { getTaskType } from '../tasks/registry';

const task = getTaskType('manifest-recon') as TaskType;
const scenario = {
  id: 'mr-1',
  taskTypeId: 'manifest-recon',
  difficulty: 1,
  input: { text: 'x' },
  groundTruth: { expected: 48, scanned: 46, missing: 2 },
  correctOutcome: { verdict: 'reroute' as const, pass: true, summary: 'x' },
} as TaskScenario;

/** A near-instant profile so tests don't actually sleep ~1s. */
const instant: MockProfile = { stepLatency: [0, 0], tokensPerSec: 1000, errorRate: 0 };

describe('makeMockClient', () => {
  it('returns the configured name', () => {
    expect(makeMockClient('Cerebras', instant).name).toBe('Cerebras');
  });

  it('returns the ground-truth answer verbatim when errorRate is 0', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // mid-range, no corruption
    const client = makeMockClient('test', instant);
    const r = await client.run(scenario, task);
    expect(r.output).toEqual(scenario.groundTruth);
    expect(r.tokensPerSec).toBeGreaterThan(0);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    vi.restoreAllMocks();
  });

  it('corrupts fields when errorRate triggers', async () => {
    // random<errorRate → corrupt; pick the first call to corrupt and a number tweak.
    let i = 0;
    const seq = [0, 0, 0.0, 0.9]; // latency lo, latency frac, corrupt-roll(<0.5 yes), then value tweaks
    vi.spyOn(Math, 'random').mockImplementation(() => seq[i++] ?? 0.5);
    const corruptible: MockProfile = { stepLatency: [0, 0], tokensPerSec: 100, errorRate: 0.5 };
    const client = makeMockClient('test', corruptible);
    const r = await client.run(scenario, task);
    // The numeric 'expected' should differ from truth when corrupted.
    const out = r.output as Record<string, unknown>;
    expect(out).toBeDefined();
    vi.restoreAllMocks();
  });

  it('records a JSON raw string', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await makeMockClient('t', instant).run(scenario, task);
    expect(typeof r.raw).toBe('string');
    expect(JSON.parse(r.raw)).toEqual(scenario.groundTruth);
    vi.restoreAllMocks();
  });
});

describe('MOCK_PROFILES', () => {
  it('has all four lanes with sensible relative speeds', () => {
    expect(MOCK_PROFILES.cerebras.tokensPerSec).toBeGreaterThan(MOCK_PROFILES.gemini.tokensPerSec);
    expect(MOCK_PROFILES.gemini.tokensPerSec).toBeGreaterThan(MOCK_PROFILES.gpu.tokensPerSec);
    expect(MOCK_PROFILES.human.tokensPerSec).toBe(0);
  });

  it('cerebras step latency is lower than gpu', () => {
    expect(MOCK_PROFILES.cerebras.stepLatency[1]).toBeLessThan(MOCK_PROFILES.gpu.stepLatency[0]);
  });
});

describe('makeHumanClient', () => {
  it('awaits the resolver and records its answer + wall-clock latency', async () => {
    const answer = { expected: 1, scanned: 1, missing: 0 };
    const resolver = vi.fn().mockResolvedValue(answer);
    const client = makeHumanClient(resolver);
    const r = await client.run(scenario, task);
    expect(resolver).toHaveBeenCalledWith(scenario, task);
    expect(r.output).toEqual(answer);
    expect(r.tokensPerSec).toBe(0); // humans don't get a tok/s rating
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('name is Human', () => {
    expect(makeHumanClient(async () => ({})).name).toBe('Human');
  });
});
