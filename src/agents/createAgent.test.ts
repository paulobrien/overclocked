/**
 * createAgent / parseOutput tests.
 *
 * parseOutput is the tolerant structured-output fallback: it must recover a
 * valid object from real model output (fences, prose around JSON, partial
 * braces) and coerce obvious stringified numbers/booleans. With the AI SDK's
 * streamObject the model now emits clean JSON, but this parser remains the
 * defensive layer — it must not crash on garbage.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseOutput } from './createAgent';
import { DamageAssessmentSchema, ManifestSchema, ConveyorIncidentSchema, CheckerSchema } from '../tasks/schemas';

describe('parseOutput', () => {
  it('parses clean JSON', () => {
    const out = parseOutput('{"damaged":true,"damageType":"crushed","severity":4,"action":"refuse"}', DamageAssessmentSchema);
    expect(out).toEqual({ damaged: true, damageType: 'crushed', severity: 4, action: 'refuse' });
  });

  it('strips ```json fences', () => {
    const raw = '```json\n{"damaged":true,"damageType":"wet","severity":2,"action":"repackage"}\n```';
    expect(parseOutput(raw, DamageAssessmentSchema)?.damageType).toBe('wet');
  });

  it('strips bare ``` fences', () => {
    const raw = '```\n{"damaged":false,"damageType":"none","severity":0,"action":"accept"}\n```';
    expect(parseOutput(raw, DamageAssessmentSchema)?.action).toBe('accept');
  });

  it('extracts JSON from surrounding prose', () => {
    const raw = 'Sure, here is the assessment:\n{"damaged":true,"damageType":"torn","severity":3,"action":"repackage"}\nLet me know if you need more.';
    expect(parseOutput(raw, DamageAssessmentSchema)?.damageType).toBe('torn');
  });

  it('coerces stringified numbers and booleans', () => {
    // Models sometimes emit "4" / "true" for numeric/boolean fields.
    const raw = '{"expected":"48","scanned":"46","missing":"2"}';
    const out = parseOutput(raw, ManifestSchema);
    expect(out).toEqual({ expected: 48, scanned: 46, missing: 2 });
  });

  it('returns null for empty input', () => {
    expect(parseOutput('', DamageAssessmentSchema)).toBeNull();
  });

  it('returns null for input with no JSON object', () => {
    expect(parseOutput('the parcel looks fine', DamageAssessmentSchema)).toBeNull();
    expect(parseOutput('no braces here at all', DamageAssessmentSchema)).toBeNull();
  });

  it('returns null when JSON is valid but schema-incompatible', () => {
    // valid JSON, wrong shape
    expect(parseOutput('{"foo":"bar"}', DamageAssessmentSchema)).toBeNull();
  });

  it('does not coerce very long numeric-looking strings (e.g. tracking numbers)', () => {
    // 12+ char numeric strings are NOT coerced — protects tracking numbers/ids.
    const schema = z.object({ id: z.string() });
    const raw = '{"id":"12345678901234"}';
    expect(parseOutput(raw, schema)?.id).toBe('12345678901234');
  });

  it('handles nested object coercion', () => {
    const schema = z.object({ outer: z.object({ flag: z.boolean(), n: z.number() }) });
    expect(parseOutput('{"outer":{"flag":"true","n":"7"}}', schema)).toEqual({
      outer: { flag: true, n: 7 },
    });
  });

  it('extracts the first balanced {...} block when there is trailing junk', () => {
    const raw = '{"expected":1,"scanned":1,"missing":0} not part of it';
    expect(parseOutput(raw, ManifestSchema)?.missing).toBe(0);
  });

  it('unwraps single-element arrays around scalar/enum fields', () => {
    // Cerebras's Gemma emits enums as ["jam"] not "jam" — a correct answer that
    // must still validate (otherwise the parse returns null and the right output
    // is lost). Schema-aware: only scalar fields are unwrapped.
    const raw = '{"event":["jam"],"action":["reroute"]}';
    expect(parseOutput(raw, ConveyorIncidentSchema)).toEqual({ event: 'jam', action: 'reroute' });
  });

  it('unwraps wrapped scalars while preserving genuine array fields', () => {
    // checker `reasons` is a real string[] and must NOT be flattened, while the
    // wrapped boolean/number scalars are unwrapped.
    const raw = '{"pass":[true],"confidence":[0.9],"reasons":["looks right","placard legible"]}';
    expect(parseOutput(raw, CheckerSchema)).toEqual({
      pass: true,
      confidence: 0.9,
      reasons: ['looks right', 'placard legible'],
    });
  });
});
