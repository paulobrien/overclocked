/**
 * Agent roster — the single source of truth for the multi-agent graph (§5),
 * surfaced to users so the coordination is visible, not just implied.
 *
 * Each incoming parcel runs through this coordinated agent graph rather than a
 * single call:
 *
 *        ┌─────────┐   ┌────────┐   ┌─────────┐  pass   ┌──────────┐
 *  item ─▶│ ROUTER  │─▶ │ WORKER │─▶ │ CHECKER │────────▶│ DECISION │─▶ graded
 *        └─────────┘   └────────┘   └────┬────┘         └──────────┘
 *                          ▲   retry ×1  │ fail              ▲
 *                          └─────────────┘                   │
 *                                        │ low-conf / 2× fail│
 *                                   ┌────▼─────────┐         │
 *                                   │ ESCALATION   │─────────┘
 *                                   └──────────────┘
 *
 * The ORCHESTRATOR (the pipeline in src/orchestrator/pipeline.ts) runs the
 * graph and applies the retry/escalate policy. This data mirrors the actual
 * roles implemented in src/agents/roles.ts + createAgent.ts so it can't drift
 * silently — keep them in sync when a role's job changes.
 */
import type { AgentRole } from '../agents/createAgent';

export interface RosterEntry {
  /** Matches the AgentRole in createAgent.ts. */
  role: AgentRole;
  /** The pipeline step id this agent maps to (Route/Work/Check/Decide). */
  stepId: 'route' | 'work' | 'check' | 'decide';
  icon: string;
  name: string;
  /** One-line job description — what this agent does per parcel. */
  job: string;
  /** Why it exists / what coordination it provides. */
  why: string;
  /** The modality it operates on. */
  modality: 'vision' | 'document' | 'text';
}

export const AGENT_ROSTER: RosterEntry[] = [
  {
    role: 'router',
    stepId: 'route',
    icon: '🚦',
    name: 'Router',
    job: 'Reads the incoming parcel (label photo + manifest line), classifies the exception type and modality, and dispatches to the right worker.',
    why: 'One agent decides what another runs — load-bearing because the belt is deliberately mixed (labels, damage, hazmat, customs…).',
    modality: 'vision',
  },
  {
    role: 'worker',
    stepId: 'work',
    icon: '🔧',
    name: 'Worker',
    job: 'The specialist task agent — extracts the structured answer (parsed address, damage verdict, HS code, etc.) against the task schema.',
    why: 'The actual work. Its output is the structured object the grader scores against ground truth.',
    modality: 'vision',
  },
  {
    role: 'checker',
    stepId: 'check',
    icon: '🔍',
    name: 'Verifier',
    job: 'Independently reviews the worker\'s output against the source — does the parsed address match the label? does declared value match the invoice?',
    why: 'Where accuracy is won. Can bounce the item back to the worker for one retry when it catches an error.',
    modality: 'vision',
  },
  {
    role: 'escalation',
    stepId: 'decide',
    icon: '⚠️',
    name: 'Exceptions Specialist',
    job: 'A heavier second-look agent, invoked only for high-stakes or low-confidence items: customs holds, hazmat, high-value, suspected tamper.',
    why: 'Makes the final call when the checker is unsure or the item is adversarial. Conservative — when in doubt, hold or refuse.',
    modality: 'vision',
  },
  {
    role: 'orchestrator',
    stepId: 'decide',
    icon: '🧭',
    name: 'Orchestrator',
    job: 'Runs the per-item graph and applies the retry/escalate/accept policy, emitting the final routing decision plus a coordination trace.',
    why: 'The supervisor. It is the multi-agent coordination the judging criterion asks for — routing, independent verification, conditional delegation.',
    modality: 'text',
  },
];

/** Look up a roster entry by role. */
export function rosterEntry(role: AgentRole): RosterEntry | undefined {
  return AGENT_ROSTER.find((e) => e.role === role);
}
