/**
 * Verdict derivation — THE single source of truth for "what operational
 * disposition does a structured output imply" (accept / reroute / hold / refuse).
 *
 * Used by BOTH the engine's pipeline (the verdict it STAMPS on a parcel) and the
 * answer-key stamper (`scripts/outcome.ts`, which fills each scenario's
 * `correctOutcome.verdict`). Sharing one function is what keeps the stamped
 * verdict and the answer key from drifting — previously they were two hand-kept
 * copies and the engine's was missing six task mappings, so correct outputs were
 * shown as "✗ wrong verdict". Guarded by `verdict.test.ts`.
 */
import type { Verdict } from '../shared/contract';

/**
 * Derive the verdict purely from the task id + the structured output fields.
 * `escalationDecision` (set by the exceptions specialist) is part of the fields,
 * so an escalation that decided hold/refuse is honoured here too.
 */
export function deriveVerdict(taskTypeId: string, fields: Record<string, unknown> | null | undefined): Verdict {
  const t = (fields ?? {}) as Record<string, unknown>;

  // Refuse: rejected outright (damage refuse, tamper, hazmat refuse, escalation refuse).
  if (t.action === 'refuse' || t.tampered === true || t.flag === 'tamper' || t.escalationDecision === 'refuse') {
    return 'refuse';
  }
  // Hold: needs intervention before it can clear.
  if (t.compliant === false || t.labelMissing === true || t.escalationDecision === 'hold' || t.sealIntact === false) {
    return 'hold';
  }
  // Text/doc routing tasks reroute by nature.
  if (taskTypeId === 'exception-routing' || taskTypeId === 'tariff-classification') return 'reroute';
  if (taskTypeId === 'restricted-screening') {
    if (t.status === 'prohibited') return 'refuse';
    if (t.status === 'restricted') return 'hold';
    return 'accept';
  }
  if (taskTypeId === 'rma-disposition') {
    if (t.disposition === 'scrap') return 'refuse';
    if (t.disposition === 'refurbish') return 'reroute';
    return 'accept';
  }
  if (taskTypeId === 'conveyor-incident') {
    // crush → refuse (already caught by action==='refuse' above); jam/fall →
    // reroute (recoverable line incident); clear → accept.
    if (t.action === 'reroute') return 'reroute';
    return 'accept';
  }
  if (taskTypeId === 'docs-completeness') return t.complete === false ? 'hold' : 'accept';
  if (taskTypeId === 'address-validation') return t.deliverable === false ? 'hold' : 'accept';
  if (taskTypeId === 'sla-risk') return t.status === 'breached' ? 'hold' : t.status === 'at-risk' ? 'reroute' : 'accept';
  return 'accept';
}
