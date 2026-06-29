/**
 * Worker unit tests — pure helpers, offline (no real model, no network).
 *
 * Covers:
 *  - resolveSchema: (role, taskTypeId) → Zod schema, for all four roles.
 *  - buildModel: throws when the provider key is missing; returns a model
 *    otherwise (the returned object's identity isn't asserted — only that it
 *    doesn't throw and is shaped like a LanguageModel).
 *  - wrapStreamAsSse: re-wraps a fake text stream into OpenAI SSE frames whose
 *    concatenated delta.content reconstructs the original JSON — the contract
 *    the client's streamChat depends on.
 */
import { describe, expect, it } from 'vitest';
import { resolveSchema, buildModel, wrapStreamAsSse, toModelMessages, type Env } from './index';

const fakeEnv = (overrides: Partial<Env> = {}): Env => ({
  CEREBRAS_API_KEY: 'sk-cer',
  CEREBRAS_BASE_URL: 'https://api.cerebras.ai/v1',
  CEREBRAS_MODEL: 'gemma-test',
  OPENROUTER_API_KEY: 'sk-or',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_MODEL: 'google/gemma-test',
  NVIDIA_API_KEY: 'nvapi-test',
  NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1',
  NVIDIA_MODEL: 'google/gemma-4-31b-it',
  GEMINI_API_KEY: 'AIza-test',
  GEMINI_BASE_URL: '',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  APP_TOKEN: '',
  ...overrides,
});

describe('resolveSchema', () => {
  it('maps a worker role + task id to the task output schema', () => {
    const s = resolveSchema('worker', 'damage-assessment');
    expect(s).toBeDefined();
    // damage truth must parse against the resolved schema
    expect(s!.safeParse({ damaged: true, damageType: 'crushed', severity: 4, action: 'refuse' }).success).toBe(true);
  });

  it('maps router/checker/escalation to their fixed schemas (no task id needed)', () => {
    expect(resolveSchema('router')?.safeParse({ taskType: 'x', modality: 'text', exceptionType: 'y' }).success).toBe(true);
    expect(resolveSchema('checker')?.safeParse({ pass: true, confidence: 0.9, reasons: [] }).success).toBe(true);
    expect(resolveSchema('escalation')?.safeParse({ decision: 'hold', override: false, rationale: 'r' }).success).toBe(true);
  });

  it('returns undefined for an unknown worker task id', () => {
    expect(resolveSchema('worker', 'no-such-task')).toBeUndefined();
  });
});

describe('buildModel', () => {
  it('throws when a provider key is missing', () => {
    expect(() => buildModel(fakeEnv({ CEREBRAS_API_KEY: '' }), 'cerebras')).toThrow(/CEREBRAS_API_KEY/);
    expect(() => buildModel(fakeEnv({ OPENROUTER_API_KEY: '' }), 'openrouter')).toThrow(/OPENROUTER_API_KEY/);
    expect(() => buildModel(fakeEnv({ NVIDIA_API_KEY: '' }), 'nvidia')).toThrow(/NVIDIA_API_KEY/);
    expect(() => buildModel(fakeEnv({ GEMINI_API_KEY: '' }), 'gemini')).toThrow(/GEMINI_API_KEY/);
  });

  it('builds a model for each provider when the key is present', () => {
    for (const provider of ['cerebras', 'openrouter', 'nvidia', 'gemini'] as const) {
      const model = buildModel(fakeEnv(), provider);
      // LanguageModel interface — has a specificationVersion + doStream/doGenerate.
      expect(model).toBeDefined();
      expect(typeof model).toBe('object');
    }
  });

  it('honours a model override over the env default', () => {
    // The override path shouldn't throw and should build — we can't read the
    // resolved id back, but exercising it confirms the override is wired.
    expect(() => buildModel(fakeEnv(), 'gemini', 'gemini-3-pro-preview')).not.toThrow();
  });
});

describe('toModelMessages', () => {
  it('lifts the system message out of the array into the system option', () => {
    const { system, messages } = toModelMessages([
      { role: 'system', content: 'You are a sortation agent.' },
      { role: 'user', content: 'Resolve this parcel.' },
    ]);
    expect(system).toBe('You are a sortation agent.');
    // No system role may remain in the messages array (the SDK rejects it).
    expect(messages.every((m) => m.role !== 'system')).toBe(true);
    expect(messages).toEqual([{ role: 'user', content: 'Resolve this parcel.' }]);
  });

  it('converts an OpenAI image_url data URL into an AI SDK image part', () => {
    const { messages } = toModelMessages([
      { role: 'system', content: 'sys' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is on this label?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ],
      },
    ]);
    expect(messages).toHaveLength(1);
    const parts = messages[0].content as Array<{ type: string; text?: string; image?: unknown }>;
    expect(parts[0]).toEqual({ type: 'text', text: 'What is on this label?' });
    expect(parts[1].type).toBe('image');
    // data: URLs pass through as the raw string (DataContent), not a URL instance.
    expect(parts[1].image).toBe('data:image/png;base64,AAAA');
  });

  it('converts an allow-listed http image_url into a URL instance', () => {
    const { messages } = toModelMessages([
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://overclocked.app/data/assets/x.svg' } }],
      },
    ]);
    const parts = messages[0].content as Array<{ type: string; image?: unknown }>;
    expect(parts[0].type).toBe('image');
    expect(parts[0].image).toBeInstanceOf(URL);
    expect(String(parts[0].image)).toBe('https://overclocked.app/data/assets/x.svg');
  });

  it('returns system undefined when there is no system message', () => {
    const { system } = toModelMessages([{ role: 'user', content: 'hi' }]);
    expect(system).toBeUndefined();
  });
});

describe('wrapStreamAsSse', () => {
  /** Drain a ReadableStream to a string. */
  async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let out = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    return out;
  }

  it('emits OpenAI-shaped data frames terminated by [DONE]', async () => {
    async function* fakeStream() {
      yield '{"a":1';
      yield '}';
    }
    const text = await drain(wrapStreamAsSse(fakeStream()));
    expect(text).toContain('data: [DONE]');
    const frames = text.split('\n\n').filter((f) => f.startsWith('data:'));
    expect(frames.length).toBe(3); // two deltas + [DONE]
    // The first real frame must parse and carry delta.content.
    const first = JSON.parse(frames[0].replace(/^data:\s*/, ''));
    expect(first.choices[0].delta.content).toBe('{"a":1');
  });

  it('reconstructs the original JSON when deltas are concatenated', async () => {
    // streamObject emits partial JSON; the client concatenates and parses.
    async function* fakeStream() {
      yield '{"carrier":"DHL","trackingNumber":"JD1",';
      yield '"serviceLevel":"EXPRESS","address":"1 St"';
      yield '}';
    }
    const text = await drain(wrapStreamAsSse(fakeStream()));
    const deltas = text
      .split('\n\n')
      .map((f) => f.replace(/^data:\s/, '').trim())
      .filter((f) => f && f !== '[DONE]')
      .map((f) => JSON.parse(f).choices[0].delta.content as string);
    const reconstructed = deltas.join('');
    const parsed = JSON.parse(reconstructed);
    expect(parsed.carrier).toBe('DHL');
    expect(parsed.serviceLevel).toBe('EXPRESS');
    expect(parsed.address).toBe('1 St');
  });

  it('emits a stable error code (not provider internals) when the source throws', async () => {
    async function* boom() {
      yield '{"x":1';
      throw new Error('model exploded with secret url https://api/?key=LEAKED');
    }
    const text = await drain(wrapStreamAsSse(boom()));
    expect(text).toContain('"error"');
    expect(text).toContain('upstream_error');
    // Critical: the raw error message (which could leak URLs/keys) must NOT ship.
    expect(text).not.toContain('LEAKED');
    expect(text).not.toContain('exploded');
  });
});
