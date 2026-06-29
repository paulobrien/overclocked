/**
 * Scoring unit tests.
 *
 * scoreItem stamps the answer key (correctVerdict/resolved) onto a grader
 * result; the aggregate helpers (totalScore, resolvedCount, verdictAccuracy,
 * meanTokensPerSec) reduce over ScoredItem[]. These are the numbers the
 * scoreboard, banner, and ROI card depend on, so they must be exact.
 */
import { describe, expect, it } from 'vitest';
import { scoreItem, totalScore, resolvedCount, clearedCount, verdictAccuracy, meanTokensPerSec, type ScoredItem } from './scoring';
import { getTaskType } from '../tasks/registry';
import type { CorrectOutcome, GradeResult } from '../shared/contract';

const damage = getTaskType('damage-assessment');
const truth = { damaged: true, damageType: 'crushed', severity: 4, action: 'refuse' };
const refuse: CorrectOutcome = { verdict: 'refuse', pass: false, summary: 'crushed → refuse' };
const accept: CorrectOutcome = { verdict: 'accept', pass: true, summary: 'ok' };

function mkItem(over: Partial<ScoredItem>): ScoredItem {
  return {
    scenarioId: 'x',
    taskTypeId: 'damage-assessment',
    difficulty: 2,
    grade: { correct: true, partial: 1, scoreDelta: 200, detail: '' } as GradeResult,
    verdict: 'refuse',
    correctVerdict: 'refuse',
    verdictCorrect: true,
    resolved: true,
    latencyMs: 100,
    tokensPerSec: 1000,
    ...over,
  };
}

describe('scoreItem', () => {
  it('stamps correctVerdict + resolved when the agent matches the answer key', () => {
    const r = scoreItem(damage, { ...truth }, truth, refuse, 'refuse');
    expect(r.verdictCorrect).toBe(true);
    expect(r.resolved).toBe(false); // refuse is pass=false → never resolved
    expect(r.correctVerdict).toBe('refuse');
    expect(r.correctSummary).toBe('crushed → refuse');
  });

  it('resolves only when pass=true AND output matches AND verdict matches', () => {
    const r = scoreItem(damage, { ...truth }, truth, accept, 'accept');
    expect(r.resolved).toBe(true);
    // wrong verdict on a pass-able case → not resolved
    const wrong = scoreItem(damage, { ...truth }, truth, accept, 'reroute');
    expect(wrong.resolved).toBe(false);
    expect(wrong.verdictCorrect).toBe(false);
  });

  it('a refused case (pass=false) is never resolved even if the agent refuses correctly', () => {
    const r = scoreItem(damage, { ...truth }, truth, refuse, 'refuse');
    expect(r.verdictCorrect).toBe(true);
    expect(r.resolved).toBe(false);
  });
});

describe('aggregates', () => {
  const items = [
    mkItem({ grade: { correct: true, partial: 1, scoreDelta: 200, detail: '' }, resolved: true, verdictCorrect: true, tokensPerSec: 1000 }),
    mkItem({ grade: { correct: true, partial: 1, scoreDelta: 200, detail: '' }, resolved: true, verdictCorrect: true, tokensPerSec: 2000 }),
    mkItem({ grade: { correct: false, partial: 0, scoreDelta: 0, detail: '' }, resolved: false, verdictCorrect: false, tokensPerSec: 0 }),
    mkItem({ grade: { correct: true, partial: 1, scoreDelta: 200, detail: '' }, resolved: false, verdictCorrect: true, tokensPerSec: 500 }), // matched output but not resolved (e.g. wrong reason)
  ];

  it('totalScore sums only scored deltas', () => {
    expect(totalScore(items)).toBe(600);
    expect(totalScore([])).toBe(0);
  });

  it('resolvedCount counts only resolved items', () => {
    expect(resolvedCount(items)).toBe(2);
  });

  it('clearedCount counts items whose output matched (partial>0)', () => {
    expect(clearedCount(items)).toBe(3); // the 0-partial one excluded
  });

  it('verdictAccuracy is the fraction with the correct stamp', () => {
    expect(verdictAccuracy(items)).toBe(0.75); // 3 of 4
    expect(verdictAccuracy([])).toBe(0);
  });

  it('meanTokensPerSec averages only lanes with tps>0', () => {
    expect(meanTokensPerSec(items)).toBe((1000 + 2000 + 500) / 3);
    expect(meanTokensPerSec([])).toBe(0);
  });
});
