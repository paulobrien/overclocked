/**
 * AgentRoster — a user-facing view of the multi-agent coordination graph (§5).
 *
 * Every parcel is processed by a coordinated agent graph, not a single call.
 * This panel makes that visible: the roles, what each does, and the flow
 * (router → worker → checker → decide, with the escalation branch). Renders in
 * two variants — `full` (lobby "How it works") and `compact` (stage legend).
 *
 * Reads from src/data/agentRoster.ts, the single source of truth, so the docs
 * can't drift from the implemented roles.
 */
import { AGENT_ROSTER, type RosterEntry } from '../data/agentRoster';

const STEP_COLOR: Record<string, string> = {
  route: '#F5A623',
  work: '#46C46E',
  check: '#3C7BF2',
  decide: '#EF5A2A',
};

export function AgentRoster({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  if (variant === 'compact') return <Compact />;
  return <Full />;
}

/** Full panel — the lobby "How it works" section. Graph + per-role detail. */
function Full() {
  const byRole = Object.fromEntries(AGENT_ROSTER.map((e) => [e.role, e])) as Record<string, RosterEntry>;
  return (
    <div>
      {/* the graph — a themed SVG flow (router → worker → checker → decision,
          with the retry loop + escalation branch), rendered from the roster. */}
      <div className="bg-black/25 border border-white/5 rounded-lg p-4 mb-4 overflow-x-auto">
        <AgentGraph byRole={byRole} />
      </div>

      {/* per-role cards */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {AGENT_ROSTER.filter((e) => e.role !== 'orchestrator').map((e) => (
          <div key={e.role} className="bg-white/[0.03] border border-white/8 rounded-lg p-3" style={{ borderTop: `2px solid ${STEP_COLOR[e.stepId]}` }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">{e.icon}</span>
              <span className="font-sig uppercase tracking-[0.08em] text-[13px] text-white">{e.name}</span>
              <span className="ml-auto font-hud text-[9px] text-[#828b99] uppercase">{e.modality}</span>
            </div>
            <p className="font-body text-[11px] text-[#a0a8b4] leading-snug mb-2">{e.job}</p>
            <p className="font-body text-[10px] text-[#6a7280] italic leading-snug">{e.why}</p>
          </div>
        ))}
      </div>

      {/* orchestrator callout */}
      <div className="mt-2.5 bg-cerebras-orange/[0.06] border border-cerebras-orange/20 rounded-lg p-3 flex gap-3 items-start">
        <span className="text-lg">{byRole.orchestrator.icon}</span>
        <div>
          <span className="font-sig uppercase tracking-[0.08em] text-[12px] text-cerebras-orange">{byRole.orchestrator.name}</span>
          <p className="font-body text-[11px] text-[#cfd6e2] leading-snug mt-0.5">{byRole.orchestrator.job} {byRole.orchestrator.why}</p>
        </div>
      </div>

      <p className="font-body text-[10px] text-[#828b99] mt-3">
        Both lanes run the <b className="text-[#8A93A3]">identical graph</b> and are graded identically — so the race
        stays fair. Every extra hop multiplies per-item latency, which is why the slower lane drowns harder under the
        same pipeline.
      </p>
    </div>
  );
}

/** A node in the agent-graph SVG: a colored rounded card with icon + name. */
function GNode({ x, y, color, icon, label, w = 132, h = 56 }: { x: number; y: number; color: string; icon: string; label: string; w?: number; h?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={color} fillOpacity={0.13} stroke={color} strokeWidth={1.6} />
      <text x={x + 15} y={y + h / 2 + 8} fontSize={22} aria-hidden="true">{icon}</text>
      <text x={x + 44} y={y + h / 2 + 5} fontSize={14} fontFamily="Oswald, sans-serif" letterSpacing="0.06em" fill="#e7ecf3">{label}</text>
    </g>
  );
}

/** The multi-agent flow as a themed SVG: router → worker → checker → decision,
 *  with the worker↔checker retry loop and the escalation branch. */
function AgentGraph({ byRole }: { byRole: Record<string, RosterEntry> }) {
  const C = STEP_COLOR;
  const lbl = { fontSize: 11, fontFamily: 'Oswald, sans-serif', letterSpacing: '0.06em', fill: '#8A93A3' } as const;
  return (
    <svg viewBox="0 0 760 232" className="w-full" style={{ minWidth: 560, height: 'auto' }} role="img" aria-label="Agent graph: router to worker to verifier to decision, with a retry loop and an escalation branch.">
      <defs>
        <marker id="arr" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 z" fill="#6a7280" />
        </marker>
        <marker id="arrAccent" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 z" fill={C.decide} />
        </marker>
      </defs>

      {/* flow arrows (drawn under the nodes) */}
      <g stroke="#6a7280" strokeWidth="2" fill="none" markerEnd="url(#arr)">
        <line x1="20" y1="88" x2="56" y2="88" />
        <line x1="190" y1="88" x2="238" y2="88" />
        <line x1="372" y1="88" x2="420" y2="88" />
        <line x1="554" y1="88" x2="604" y2="88" />
        <line x1="726" y1="88" x2="752" y2="88" />
        {/* escalation branch: checker ↓ escalation */}
        <line x1="488" y1="116" x2="488" y2="156" />
      </g>
      {/* retry loop: checker ↺ worker (curves up over the top) */}
      <path d="M470,60 C 440,18 336,18 306,58" fill="none" stroke={C.work} strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#arr)" />
      {/* escalation → decision (final call) */}
      <path d="M554,178 C 612,178 632,150 660,118" fill="none" stroke={C.decide} strokeWidth="2" markerEnd="url(#arrAccent)" />

      {/* labels */}
      <text x="6" y="80" {...lbl}>item</text>
      <text x="744" y="80" textAnchor="end" {...lbl}>graded</text>
      <text x="388" y="20" textAnchor="middle" {...lbl}>retry ×1</text>
      <text x="565" y="84" textAnchor="middle" fontSize="11" fontFamily="Oswald, sans-serif" fill={C.work}>pass</text>
      <text x="498" y="140" {...lbl}>low-conf · high-stakes</text>

      {/* nodes */}
      <GNode x={58} y={60} color={C.route} icon={byRole.router.icon} label="Router" />
      <GNode x={240} y={60} color={C.work} icon={byRole.worker.icon} label="Worker" />
      <GNode x={422} y={60} color={C.check} icon={byRole.checker.icon} label="Verifier" />
      <GNode x={606} y={60} color={C.decide} icon="✅" label="Decision" w={120} />
      <GNode x={422} y={158} color={C.decide} icon={byRole.escalation.icon} label="Exceptions" w={132} h={46} />
    </svg>
  );
}

/** Compact legend — maps the live pipeline step pills to the agents behind them. */
function Compact() {
  const steps: Array<{ id: string; label: string }> = [
    { id: 'route', label: 'Route' },
    { id: 'work', label: 'Work' },
    { id: 'check', label: 'Check' },
    { id: 'decide', label: 'Decide' },
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {steps.map((s) => {
        const entry = AGENT_ROSTER.find((e) => e.stepId === s.id && e.role !== 'orchestrator');
        if (!entry) return null;
        return (
          <span key={s.id} className="font-hud text-[10.5px] text-[#8A93A3] flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: STEP_COLOR[s.id] }}
            />
            {entry.icon} {entry.name}
          </span>
        );
      })}
    </div>
  );
}
