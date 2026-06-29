/**
 * The unified AgentClient implementations (§4 contract).
 *
 * Cerebras, OpenRouter (GPU), Mock, and Human all implement the SAME interface,
 * so the lanes are perfectly symmetric and graded identically — the only
 * variable is the silicon. The Mock is the fake-first fallback that lets the
 * engine run start-to-finish with zero API calls (de-risks the demo: if a
 * provider flakes during judging, the mock lane still races).
 */
import type { AgentClient, AgentResult, TaskScenario, TaskType } from '../shared/contract';
import type { ProviderConfig } from './streaming';
import { workerAgentFromTask } from './createAgent';

// ───────────────────────── Cerebras lane ─────────────────────────
// The wafer-scale lane. Provider config selects the Cerebras route through the
// Worker; the model id comes from the Worker default unless overridden.
export function makeCerebrasClient(model?: string): AgentClient {
  const provider: ProviderConfig = { provider: 'cerebras', model, temperature: 0.2, maxTokens: 512 };
  return {
    name: 'Cerebras',
    async run(scenario, task) {
      const agent = workerAgentFromTask(task);
      const r = await agent.run(scenario, provider);
      return toResult(r);
    },
  };
}

// ───────────────────────── OpenRouter (GPU) lane ─────────────────────────
// The challenger. Default = the SAME model as Cerebras, just GPU-hosted, so
// the race is a pure silicon-vs-silicon comparison (same model, same scenarios,
// same grader). Switchable for exhibition rounds.
export function makeOpenRouterClient(model?: string): AgentClient {
  const provider: ProviderConfig = { provider: 'openrouter', model, temperature: 0.2, maxTokens: 512 };
  return {
    name: 'Challenger',
    async run(scenario, task) {
      const agent = workerAgentFromTask(task);
      const r = await agent.run(scenario, provider);
      return toResult(r);
    },
  };
}

// ───────────────────────── NVIDIA NIM lane (alternative challenger) ──────────
// A drop-in alternative to the OpenRouter challenger: the SAME Gemma 4 31B,
// GPU-hosted on NVIDIA's OpenAI-compatible NIM endpoint. Same unified client +
// structured-output pipeline, so the race stays a pure silicon comparison vs
// Cerebras. Selected per-run from the lobby.
export function makeNvidiaClient(model?: string): AgentClient {
  const provider: ProviderConfig = { provider: 'nvidia', model, temperature: 0.2, maxTokens: 512 };
  return {
    name: 'NVIDIA',
    async run(scenario, task) {
      const agent = workerAgentFromTask(task);
      const r = await agent.run(scenario, provider);
      return toResult(r);
    },
  };
}

// ───────────────────────── Gemini lane (bottom production line) ──────────
// The third lane — Gemini 3.1 Flash Lite via @ai-sdk/google. Same unified
// AgentClient + same structured-output pipeline as the other two, so it's a
// fair, gradeable comparison. Flash Lite is the cost/latency workhorse.
export function makeGeminiClient(model?: string): AgentClient {
  const provider: ProviderConfig = { provider: 'gemini', model, temperature: 0.2, maxTokens: 512 };
  return {
    name: 'Gemini',
    async run(scenario, task) {
      const agent = workerAgentFromTask(task);
      const r = await agent.run(scenario, provider);
      return toResult(r);
    },
  };
}

function toResult(r: { output: unknown; raw: string; tokens: number; latencyMs: number; tokensPerSec: number }): AgentResult {
  return { output: r.output, raw: r.raw, tokens: r.tokens, latencyMs: r.latencyMs, tokensPerSec: r.tokensPerSec };
}

// ───────────────────────── Mock lane (fake-first) ─────────────────────────
// Deterministic fake latency + correct outputs drawn from ground truth (with a
// tunable error rate). This is the engine's test harness AND the demo fallback.
// Cerebras mock is fast; the GPU mock is slow — that's the visible gap.
export interface MockProfile {
  /** Base per-step latency in ms. Cerebras ~180, GPU ~1100. */
  stepLatency: [number, number];
  /** tokens/sec the speedometer shows. */
  tokensPerSec: number;
  /** Probability the mock emits a WRONG field (0 = perfect, drives accuracy). */
  errorRate: number;
}

// The headline demo number is the speedometer (tokensPerSec): Cerebras runs at
// ~950 tok/s, every other (GPU-hosted) model at ~95 — a clean ~10× gap — and the
// slow lanes' per-step latency is ~10× higher so the belt visibly backs up.
export const MOCK_PROFILES = {
  cerebras: { stepLatency: [180, 260] as [number, number], tokensPerSec: 950, errorRate: 0.05 },
  gpu: { stepLatency: [1900, 2600] as [number, number], tokensPerSec: 95, errorRate: 0.1 },
  // Gemini 3.1 Flash Lite — a GPU-hosted challenger like the rest; same ~95 tok/s
  // band, a touch quicker per item. High accuracy (structured output helps).
  gemini: { stepLatency: [1700, 2300] as [number, number], tokensPerSec: 96, errorRate: 0.05 },
  human: { stepLatency: [3500, 6000] as [number, number], tokensPerSec: 0, errorRate: 0.2 },
} satisfies Record<string, MockProfile>;

export function makeMockClient(name: string, profile: MockProfile): AgentClient {
  return {
    name,
    async run(scenario, _task) {
      const [lo, hi] = profile.stepLatency;
      const latency = lo + Math.random() * (hi - lo);
      await sleep(latency);
      // Build an output from ground truth, occasionally corrupting a field.
      const output = corrupt(scenario.groundTruth, profile.errorRate);
      return {
        output,
        raw: JSON.stringify(output),
        tokens: 40 + Math.floor(Math.random() * 60),
        latencyMs: latency,
        tokensPerSec: profile.tokensPerSec * (0.95 + Math.random() * 0.1),
      };
    },
  };
}

function corrupt(truth: Record<string, unknown>, errorRate: number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...truth };
  for (const key of Object.keys(out)) {
    if (Math.random() < errorRate) {
      const v = out[key];
      if (typeof v === 'number') out[key] = v + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
      else if (typeof v === 'string') out[key] = v + '?';
      else if (typeof v === 'boolean') out[key] = !v;
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ───────────────────────── Human lane ─────────────────────────
// The human races on the same queue via click-to-classify. The store supplies
// the human's answer through a resolver; the client just awaits it. Great for
// the demo laugh (the human gets crushed).
export type HumanResolver = (scenario: TaskScenario, task: TaskType) => Promise<unknown>;

export function makeHumanClient(resolver: HumanResolver): AgentClient {
  return {
    name: 'Human',
    async run(scenario, task) {
      const start = performance.now();
      const output = await resolver(scenario, task);
      const latencyMs = performance.now() - start;
      return {
        output,
        raw: JSON.stringify(output),
        tokens: 0,
        latencyMs,
        tokensPerSec: 0,
      };
    },
  };
}
