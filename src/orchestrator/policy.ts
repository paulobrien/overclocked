/**
 * Retry / escalate / accept policy (§5).
 *
 * Encapsulated here so the policy is one place, not scattered through the
 * pipeline. The pipeline consults these predicates.
 */
import type { TaskScenario, TaskType } from '../shared/contract';
import type { CheckerVerdict } from '../tasks/schemas';

export interface PolicyInput {
  scenario: TaskScenario;
  task: TaskType;
  checker?: CheckerVerdict | null;
  attempts: number;
}

/** Should we retry the worker? Max one retry, and only on a checker fail. */
export function shouldRetry(input: PolicyInput): boolean {
  return input.attempts < 2 && input.checker != null && !input.checker.pass;
}

/** Should we escalate to the exceptions specialist?
 *  Only when the item genuinely warrants a second look: the Verifier bounced it,
 *  the Verifier passed it but with low confidence, or it's a known-adversarial
 *  highlight case. Routine items — including plain difficulty-3 tasks — clear
 *  WITHOUT the specialist, so the escalation rate reflects real exceptions, not
 *  task volume. (Difficulty drives points + the speed gap, not auto-escalation.) */
export function shouldEscalate(input: PolicyInput): boolean {
  const checkerFailed = input.checker != null && !input.checker.pass;
  const lowConf = input.checker != null && input.checker.confidence < 0.6;
  return !!input.scenario.adversarial || checkerFailed || lowConf;
}

/** ROI flavor: how many "manual minutes" a cleared item saved vs. a human. */
export const MANUAL_MINUTES_PER_ITEM = 4;
export const COST_PER_MANUAL_MINUTE_GBP = 0.4;

export function roiSavedFor(cleared: number): number {
  return Math.round(cleared * MANUAL_MINUTES_PER_ITEM * COST_PER_MANUAL_MINUTE_GBP);
}
