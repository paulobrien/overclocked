/**
 * Trace formatter — turns a CoordinationTrace into a human-readable string for
 * the post-round review panel and the demo narration.
 */
import type { CoordinationTrace } from '../shared/contract';
import { VERDICT_META } from '../shared/contract';

export function summarizeTrace(t: CoordinationTrace): string {
  const stepLine = t.steps
    .map((s) => {
      const icon = s.status === 'done' ? '✓' : s.status === 'fail' ? '✗' : s.status === 'running' ? '…' : '◌';
      return `${s.label} ${icon}`;
    })
    .join(' → ');
  const bits: string[] = [stepLine];
  if (t.retries) bits.push(`${t.retries} retry`);
  if (t.escalated) bits.push('escalated');
  if (t.caught) bits.push(`checker caught ${t.caught}`);
  bits.push(`verdict: ${VERDICT_META[t.verdict].label}`);
  return bits.join(' · ');
}
