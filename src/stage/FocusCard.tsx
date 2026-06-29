/**
 * FocusCard — the parcel dossier / exception ticket (§8 signature element).
 *
 * This is where the multi-agent coordination becomes VISIBLE: the pipeline
 * steps light up in sequence (Routed → Extracted → Checked ✓/✗ retry →
 * Decided), an escalation badge appears when the specialist is pulled in, and
 * fields rubber-stamp in one by one, finished with an ACCEPT/REROUTE/HOLD/
 * REFUSE stamp THWACK. The steps animating is what makes the graph run on
 * camera — judges see the coordination, not just a result appear.
 */
import { useEffect, useRef } from 'react';
import type { LaneView, LaneFocus } from '../store/arena';
import { VERDICT_META, type PipelineStepTrace } from '../shared/contract';
import { play } from '../audio/sfx';

export function FocusCard({ lane }: { lane: LaneView }) {
  const focus: LaneFocus | null = lane.liveFocus ?? lane.runtime.focus;

  // Play the stamp SFX when a verdict lands and confetti triggers on clear.
  useEffect(() => {
    if (focus?.stamping && focus.verdict) {
      play(focus.verdict === 'accept' || focus.verdict === 'reroute' ? 'clear' : 'stamp');
    }
  }, [focus?.stamping, focus?.verdict]);

  // Fire the escalation blip once when the specialist is pulled in (the edge
  // into escalated), so the audio tracks the visible "↑ Escalated" badge.
  const prevEscalated = useRef(false);
  useEffect(() => {
    if (focus?.escalated && !prevEscalated.current) play('escalate');
    prevEscalated.current = !!focus?.escalated;
  }, [focus?.escalated]);

  if (!focus) {
    return (
      <div className="focus" style={{ borderTop: '3px solid var(--c)' }}>
        <div className="text-center font-hud text-[13px] text-[#5e5443] pt-10">awaiting parcel…</div>
      </div>
    );
  }

  const scenario = focus.scenario;
  return (
    <div className="focus" style={{ borderTop: '3px solid var(--c)' }}>
      <div className="fc-top flex items-center justify-between gap-2">
        <span className="item-id font-hud font-extrabold text-[15px] tracking-[0.02px]">
          PARCEL #{lane.runtime.itemNo}
        </span>
        <span className="task-chip font-sig uppercase tracking-[0.06em] text-[11.5px] bg-[rgba(42,38,32,0.1)] border border-[rgba(42,38,32,0.18)] rounded-[5px] px-2 py-0.5 flex items-center gap-1">
          <span>{focus.task.icon}</span>
          <span>{focus.task.label}</span>
        </span>
      </div>

      {/* pipeline steps */}
      <div className="pipe flex gap-[5px] my-2.5 mt-[10px]">
        {focus.steps.map((step) => (
          <StepPill key={step.id} step={step} />
        ))}
      </div>

      {/* provider error — shown when the live pipeline threw, so a bad model id /
          missing key / down Worker is obvious on screen (not a fake verdict). */}
      {focus.error && (
        <div className="mt-1 mb-1 rounded-md border border-alert-red/60 bg-alert-red/10 px-2.5 py-2" role="alert">
          <div className="font-sig uppercase tracking-[0.08em] text-[11px] text-alert-red">⚠ Provider error</div>
          <div className="font-hud text-[11.5px] text-alert-red/90 mt-0.5">{focus.error}</div>
        </div>
      )}

      {/* fields */}
      <div className="fields font-body text-[13px] text-[#3a342b]">
        {focus.fields.length === 0 && (
          <div className="text-[#5e5443] italic">{scenario.input.text?.slice(0, 80) ?? 'resolving…'}</div>
        )}
        {focus.fields.map((f, i) => (
          <div
            key={f.key}
            className={`frow flex justify-between items-baseline gap-2 min-w-0 py-[3px] ${i === focus.fields.length - 1 ? '' : 'border-b border-dashed border-[rgba(42,38,32,0.16)]'} ${f.visible ? 'in' : ''}`}
          >
            <span className="k text-[#5e5443] flex-shrink-0">{f.label}</span>
            <span
              className="v font-hud font-bold truncate text-right min-w-0"
              style={{
                opacity: f.visible ? 1 : 0,
                transform: f.visible ? 'none' : 'translateY(3px)',
                transition: '0.25s',
                color: f.ok === false ? '#b53a2a' : '#2A2620',
              }}
            >
              {f.visible ? fmt(f.value) : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* escalation badge */}
      <span
        className="esc-badge absolute left-2.5 bottom-2.5 font-sig uppercase tracking-[0.1em] text-[10.5px] text-white bg-alert-red px-[7px] py-[3px] rounded-[5px]"
        style={{ opacity: focus.escalated ? 1 : 0, animation: focus.escalated ? 'nudge 0.7s infinite' : 'none', transition: '0.25s' }}
      >
        ↑ Escalated
      </span>

      {/* verdict stamp */}
      {focus.verdict && (
        <span
          className={`verdict absolute right-2.5 bottom-2 font-sig font-bold uppercase tracking-[0.08em] text-[18px] px-2.5 py-0.5 rounded-md ${focus.stamping ? 'show' : ''} ${VERDICT_META[focus.verdict].className}`}
          style={{
            transform: 'rotate(-9deg)',
            opacity: focus.stamping ? 1 : 0,
            border: '2.5px solid currentColor',
            animation: focus.stamping ? 'thwack 0.45s cubic-bezier(.2,1.4,.5,1) forwards' : 'none',
          }}
        >
          {VERDICT_META[focus.verdict].label}
        </span>
      )}

      {/* correct-outcome annotation: shown when the agent's verdict was WRONG,
          so judges see the answer key vs what the agent actually stamped. */}
      {focus.stamping && focus.correctVerdict && focus.verdictCorrect === false && (
        <span
          className="absolute right-2.5 bottom-12 font-hud text-[10.5px] text-alert-red bg-[rgba(224,83,63,0.12)] border border-alert-red/40 rounded px-1.5 py-0.5"
          style={{ animation: 'fade 0.3s ease' }}
          title={focus.correctSummary}
        >
          should be: {VERDICT_META[focus.correctVerdict].label.toUpperCase()}
        </span>
      )}

      {/* pass/fail pill — the honest per-case outcome. */}
      {focus.stamping && (
        <span
          className={`absolute left-2.5 bottom-2 font-hud text-[10.5px] rounded px-1.5 py-0.5 ${
            focus.verdictCorrect ? 'text-cleared-green bg-cleared-green/10 border border-cleared-green/30' : 'text-alert-red bg-alert-red/10 border border-alert-red/30'
          }`}
        >
          {focus.verdictCorrect ? '✓ correct' : '✗ wrong verdict'}
        </span>
      )}
    </div>
  );
}

function StepPill({ step }: { step: PipelineStepTrace }) {
  const cls = step.status === 'done' ? 'done' : step.status === 'fail' ? 'fail' : step.status === 'running' ? 'on' : '';
  const pillBg =
    step.status === 'done'
      ? 'var(--cleared-green, #46C46E)'
      : step.status === 'fail'
        ? 'var(--alert-red, #e0533f)'
        : step.status === 'running'
          ? 'var(--c)'
          : 'rgba(42,38,32,0.18)';
  return (
    <div className={`step flex-1 flex flex-col items-center gap-1 ${cls}`} style={{ opacity: step.status === 'pending' ? 0.35 : 1, transition: 'opacity .2s' }}>
      <span className="pill w-full h-1.5 rounded" style={{ background: pillBg }} />
      <span className="nm font-sig uppercase tracking-[0.08em] text-[10px] text-[#6a5f4d]">{step.label}</span>
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}
