/**
 * prompt.ts tests — schema → instruction rendering + multimodal message assembly.
 *
 * schemaToInstruction turns a Zod object into a TypeScript-shape string the
 * prompt uses to constrain output. systemPrompt wraps it. buildUserMessage
 * attaches the image (now async — base64 conversion) when present.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { schemaToInstruction, systemPrompt, buildUserMessage } from './prompt';

describe('schemaToInstruction', () => {
  it('renders a flat object with primitive types', () => {
    const s = z.object({ name: z.string(), count: z.number(), ok: z.boolean() });
    const out = schemaToInstruction(s);
    expect(out).toContain('name: string');
    expect(out).toContain('count: number');
    expect(out).toContain('ok: boolean');
    expect(out).toContain('{');
  });

  it('renders enums as a literal union list', () => {
    const s = z.object({ action: z.enum(['accept', 'refuse']) });
    expect(schemaToInstruction(s)).toContain('["accept","refuse"]');
  });

  it('renders arrays', () => {
    const s = z.object({ tags: z.array(z.string()) });
    expect(schemaToInstruction(s)).toContain('tags: string[]');
  });
});

describe('systemPrompt', () => {
  it('includes the role and the JSON-only instruction', () => {
    const out = systemPrompt('test agent', z.object({ x: z.number() }));
    expect(out).toContain('test agent');
    expect(out).toContain('JSON');
    expect(out).toContain('x: number');
  });
});

describe('buildUserMessage', () => {
  it('returns a text-only user message when there is no image', async () => {
    const m = await buildUserMessage({ id: 'x', taskTypeId: 't', input: { text: 'hello' }, groundTruth: {}, difficulty: 1, correctOutcome: { verdict: 'accept', pass: true, summary: '' } });
    expect(m.role).toBe('user');
    expect(typeof m.content).toBe('string');
    expect(m.content).toContain('hello');
  });

  it('includes documents as labeled blocks', async () => {
    const m = await buildUserMessage({ id: 'x', taskTypeId: 't', input: { text: 'q', documents: ['doc one', 'doc two'] }, groundTruth: {}, difficulty: 1, correctOutcome: { verdict: 'accept', pass: true, summary: '' } });
    expect(m.content as string).toContain('--- Document 1 ---');
    expect(m.content as string).toContain('doc two');
  });

  it('builds a multimodal message (text + image part) when imageUrl is a data URL', async () => {
    const dataUrl = 'data:image/svg+xml,<svg/>';
    const m = await buildUserMessage({ id: 'x', taskTypeId: 't', input: { text: 'see image', imageUrl: dataUrl }, groundTruth: {}, difficulty: 1, correctOutcome: { verdict: 'accept', pass: true, summary: '' } });
    expect(Array.isArray(m.content)).toBe(true);
    const parts = m.content as Array<{ type: string }>;
    expect(parts.some((p) => p.type === 'text')).toBe(true);
    expect(parts.some((p) => p.type === 'image_url')).toBe(true);
  });
});
