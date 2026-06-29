/**
 * Controls — the in-race transport bar: a live timer + the preset switcher
 * (30s / 1m / 5m / Endless) + Reset (→ lobby) + End (score now).
 *
 * Switching a preset restarts the race at the chosen duration (the whole point
 * of a preset is a clean timed window). There is deliberately no pause: the
 * lanes are live agents, so freezing the clock can't freeze in-flight model
 * calls — to halt a run, End it or Reset. All lanes always get the same tasks
 * (fairness is in the engine, not here), so the preset just sets the window.
 */
import { useArena } from '../store/arena';
import { MODE_CONFIG, type Mode } from '../engine/arrivalPump';

const PRESETS: { id: Mode; label: string }[] = [
  { id: 'short', label: '30s' },
  { id: 'standard', label: '1 min' },
  { id: 'extended', label: '5 min' },
  { id: 'endless', label: '∞' },
];

/** Format the live time. Endless mode counts elapsed (timeLeft goes negative). */
function fmtTime(timeLeft: number, mode: Mode): string {
  if (mode === 'endless') {
    // timeLeft decrements from MAX_SAFE_INTEGER; show elapsed instead.
    // The store holds a large negative-ish value; display a generic ∞-ish readout.
    return '∞';
  }
  if (timeLeft <= 0) return '0:00';
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Controls() {
  const phase = useArena((s) => s.phase);
  const mode = useArena((s) => s.mode);
  const timeLeft = useArena((s) => s.timeLeft);
  const reset = useArena((s) => s.reset);
  const endEarly = useArena((s) => s.endEarly);
  const start = useArena((s) => s.start);

  if (phase === 'ended') {
    return (
      <div className="relative z-[5] flex justify-center pb-3 gap-2">
        <button
          onClick={reset}
          className="font-sig uppercase tracking-[0.14em] text-[12px] cursor-pointer text-[#1A1F2B] bg-cerebras-orange border-none rounded-md px-6 py-2 font-bold hover:brightness-110"
        >
          ↻ New race
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-[5] flex flex-wrap items-center justify-center gap-2 pb-3">
      {/* live timer */}
      <div className="font-hud font-bold text-[15px] text-white bg-black/30 border border-white/10 rounded-md px-3 py-2 tabular-nums min-w-[68px] text-center">
        {fmtTime(timeLeft, mode)}
      </div>

      {/* preset switcher — restarts the race at the chosen window */}
      <div className="flex bg-black/20 border border-white/10 rounded-md overflow-hidden">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => start(p.id)}
            className={`font-sig uppercase tracking-[0.1em] text-[12px] cursor-pointer px-3 py-2 transition-colors ${
              mode === p.id ? 'bg-cerebras-orange text-[#1A1F2B] font-bold' : 'text-[#8A93A3] hover:text-white hover:bg-white/5'
            }`}
            title={`${MODE_CONFIG[p.id].durationSec >= Number.MAX_SAFE_INTEGER ? 'Endless' : MODE_CONFIG[p.id].durationSec + 's'} window`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Reset → lobby */}
      <button
        onClick={reset}
        className="font-sig uppercase tracking-[0.14em] text-[11px] cursor-pointer text-[#8A93A3] hover:text-white border border-white/10 rounded-md px-4 py-2 hover:border-white/30 transition-colors"
      >
        ↺ Reset
      </button>

      {/* End (score now) */}
      <button
        onClick={endEarly}
        className="font-sig uppercase tracking-[0.14em] text-[11px] cursor-pointer text-alert-red border border-alert-red/30 rounded-md px-4 py-2 hover:bg-alert-red/10 transition-colors"
      >
        ⏹ End
      </button>
    </div>
  );
}
