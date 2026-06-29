/**
 * Correct-outcome derivation — the answer key (verdict / pass / summary)
 * computed deterministically from a scenario's ground truth + task type.
 *
 * The verdict comes from the SAME shared `deriveVerdict` the engine stamps with
 * (`src/orchestrator/verdict.ts`), so the answer key and the engine's stamped
 * verdict can't drift. Imported by both `add-correct-outcome.ts` (the migration)
 * and `generate.ts` (the generator).
 */
import type { Verdict } from '../src/shared/contract';
import { deriveVerdict } from '../src/orchestrator/verdict';

export type { Verdict };

export interface CorrectOutcome {
  verdict: Verdict;
  pass: boolean;
  summary: string;
}

/** Build a one-line summary from the ground truth's headline fields. */
export function summarize(taskTypeId: string, t: Record<string, any>, blurb?: string): string {
  if (blurb) {
    // Strip a trailing "(...)" aside, but fall through to the task-specific
    // summary if that leaves nothing — the loader requires a non-empty summary,
    // and a model-authored blurb can be empty or fully parenthetical.
    const trimmed = blurb.replace(/\s*\(.*\)$/, '').trim();
    if (trimmed) return trimmed;
  }
  switch (taskTypeId) {
    case 'label-parse':
      return `${t.carrier} ${t.serviceLevel} → ${String(t.address).split(',')[0]}`;
    case 'damage-assessment':
      return t.damaged ? `${t.damageType} severity ${t.severity} → ${t.action}` : 'no damage → accept';
    case 'hazmat-detection':
      return `UN ${t.unClass} ${t.labelMissing ? 'label missing' : 'compliant'}`;
    case 'customs-invoice':
      return `${t.hsCode} ${t.declaredValue} (${t.countryOfOrigin})`;
    case 'seal-tamper':
      return t.tampered ? 'tampered → refuse' : 'seal intact';
    case 'manifest-recon':
      return t.missing > 0 ? `${t.missing} short` : 'reconciled';
    case 'tariff-classification':
      return `${t.hsCode} (${t.dutyCategory})`;
    case 'exception-routing':
      return `${t.category} → ${t.queue} (${t.priority})`;
    case 'dim-weight':
      return t.mismatch ? 'dim/weight mismatch' : 'dims consistent';
    case 'pallet-check':
      return `${t.cartonCount} cartons${t.overhang ? ' +overhang' : ''}${t.stackingViolation ? ' +unstable' : ''}`;
    case 'address-validation':
      return t.deliverable ? `valid (${t.zone})` : 'undeliverable';
    case 'carrier-select':
      return `${t.carrier} ${t.service} ${t.cost}`;
    case 'sla-risk':
      return `${t.status} ETA ${t.etaHours}h (${t.cause})`;
    case 'rma-disposition':
      return `${t.disposition} — ${t.reason}`;
    case 'restricted-screening':
      return `${t.status} — ${t.reason}`;
    case 'docs-completeness':
      return t.complete ? 'all docs present' : 'incomplete docs';
    case 'handwritten-label':
      return `${t.name}, ${t.addressLine} ${t.postcode}`;
    case 'conveyor-incident': {
      const label: Record<string, string> = {
        clear: 'clean pass → accept',
        jam: 'belt jam → reroute',
        fall: 'fell off belt → reroute',
        crush: 'crushed on line → refuse',
      };
      return label[String(t.event)] ?? `${t.event} → ${t.action}`;
    }
    default:
      return taskTypeId;
  }
}

/** Compose the full correctOutcome for a scenario. pass=false only for refuse. */
export function correctOutcomeFor(taskTypeId: string, groundTruth: Record<string, any>, blurb?: string): CorrectOutcome {
  const verdict = deriveVerdict(taskTypeId, groundTruth);
  return { verdict, pass: verdict !== 'refuse', summary: summarize(taskTypeId, groundTruth, blurb) };
}
