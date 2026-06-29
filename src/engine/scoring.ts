/**
 * Scoring (§4).
 *
 *   score = Σ (partial × difficulty × BASE_POINTS) over cleared items.
 *
 * Throughput falls out naturally — the faster lane simply clears more items in
 * the window, so "throughput × accuracy" needs no separate term. A wrong
 * answer scores 0 (partial becomes 0) but still consumes the lane's time, which
 * is the realistic penalty.
 */
import type { CoordinationTrace, CorrectOutcome, GradeResult, TaskType, Verdict } from '../shared/contract';
import { BASE_POINTS } from '../shared/contract';

export interface ScoredItem {
  scenarioId: string;
  taskTypeId: string;
  difficulty: number;
  grade: GradeResult;
  verdict: CoordinationTrace['verdict'];
  latencyMs: number;
  tokensPerSec: number;
  /** The verdict the agent SHOULD have stamped (answer key). */
  correctVerdict: Verdict;
  /** Whether the agent's stamped verdict matched the correct one. */
  verdictCorrect: boolean;
  /** Whether this case was resolved per the answer key's pass flag. */
  resolved: boolean;
}

/** Grade a finalized pipeline output against its ground truth, then stamp the
 *  scenario's declared correct outcome onto the result so the UI/trace can show
 *  "should have been X, agent said Y". */
export function scoreItem(
  task: TaskType,
  output: unknown,
  truth: Record<string, unknown>,
  correct: CorrectOutcome,
  agentVerdict: Verdict,
): GradeResult & { verdictCorrect: boolean; resolved: boolean } {
  const grade = task.grade(output, truth);
  const verdictCorrect = agentVerdict === correct.verdict;
  // A case is "resolved" if the agent's output matched ground truth (grade)
  // AND it reached the correct operational verdict. The correctOutcome.pass flag
  // says whether resolving is even possible for this case.
  const resolved = correct.pass && grade.partial > 0 && verdictCorrect;
  return {
    ...grade,
    correctVerdict: correct.verdict,
    correctSummary: correct.summary,
    verdictCorrect,
    resolved,
  };
}

/** Sum the score deltas. */
export function totalScore(items: ScoredItem[]): number {
  return items.reduce((sum, i) => sum + (i.grade.partial > 0 ? i.grade.scoreDelta : 0), 0);
}

/** Cases resolved per the answer key — the honest "parcels cleared" number. */
export function resolvedCount(items: ScoredItem[]): number {
  return items.filter((i) => i.resolved).length;
}

/** Items where the output matched ground truth (regardless of verdict). */
export function clearedCount(items: ScoredItem[]): number {
  return items.filter((i) => i.grade.partial > 0).length;
}

/** How often the agent stamped the CORRECT verdict (the operational accuracy). */
export function verdictAccuracy(items: ScoredItem[]): number {
  if (!items.length) return 0;
  return items.filter((i) => i.verdictCorrect).length / items.length;
}

/** Mean tokens/sec over the round (the headline speed stat). */
export function meanTokensPerSec(items: ScoredItem[]): number {
  if (!items.length) return 0;
  const valid = items.filter((i) => i.tokensPerSec > 0);
  if (!valid.length) return 0;
  return valid.reduce((s, i) => s + i.tokensPerSec, 0) / valid.length;
}

export { BASE_POINTS };
