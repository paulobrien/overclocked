/**
 * verdict.test.ts — guards the answer-key ↔ engine consistency.
 *
 * deriveVerdict is the single source of truth shared by the engine (the verdict
 * it STAMPS) and the answer-key stamper (correctOutcome.verdict). If they ever
 * drift, correct outputs get shown as "✗ wrong verdict". This asserts they agree
 * across the whole scenario pool, plus the per-task disposition rules.
 */
import { describe, it, expect } from 'vitest';
import { SCENARIOS } from '../data/scenarios';
import { deriveVerdict } from './verdict';

describe('deriveVerdict', () => {
  it('matches every scenario\'s stamped correctOutcome.verdict across the pool', () => {
    const mismatches = SCENARIOS.filter(
      (s) => deriveVerdict(s.taskTypeId, s.groundTruth as Record<string, unknown>) !== s.correctOutcome.verdict,
    ).map(
      (s) => `${s.id}: got ${deriveVerdict(s.taskTypeId, s.groundTruth as Record<string, unknown>)}, want ${s.correctOutcome.verdict}`,
    );
    expect(mismatches).toEqual([]);
  });

  it('applies each task\'s disposition rules', () => {
    expect(deriveVerdict('damage-assessment', { action: 'refuse' })).toBe('refuse');
    expect(deriveVerdict('seal-tamper', { tampered: true, flag: 'tamper' })).toBe('refuse');
    expect(deriveVerdict('seal-tamper', { sealIntact: false, tampered: false })).toBe('hold');
    expect(deriveVerdict('restricted-screening', { status: 'prohibited' })).toBe('refuse');
    expect(deriveVerdict('restricted-screening', { status: 'restricted' })).toBe('hold');
    expect(deriveVerdict('restricted-screening', { status: 'allowed' })).toBe('accept');
    expect(deriveVerdict('rma-disposition', { disposition: 'scrap' })).toBe('refuse');
    expect(deriveVerdict('rma-disposition', { disposition: 'refurbish' })).toBe('reroute');
    expect(deriveVerdict('docs-completeness', { complete: false })).toBe('hold');
    expect(deriveVerdict('address-validation', { deliverable: false })).toBe('hold');
    expect(deriveVerdict('sla-risk', { status: 'breached' })).toBe('hold');
    expect(deriveVerdict('sla-risk', { status: 'at-risk' })).toBe('reroute');
    expect(deriveVerdict('tariff-classification', { hsCode: 'x', dutyCategory: 'standard' })).toBe('reroute');
  });

  it('does NOT blanket-hold a clean escalation (the specialist reviewed but released)', () => {
    expect(deriveVerdict('handwritten-label', { escalationDecision: 'release', name: 'A' })).toBe('accept');
    expect(deriveVerdict('exception-routing', { escalationDecision: 'release', category: 'x', queue: 'y', priority: 'P2' })).toBe('reroute');
  });
});
