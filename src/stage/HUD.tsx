/**
 * HUD — the speedometer + meters under each lane (§9 bottom of each column).
 *
 * The tokens/sec gauge is the arcade readout that makes the speed gap visceral:
 * Cerebras needle pinned right, GPU needle barely off the peg. Cleared/backlog
 * bars and the coordination stat chips (checker caught N, escalated M) surface
 * the multi-agent ROI flavor.
 */
import type { LaneRuntime } from '../engine/loop';

export function HUD({ runtime }: { runtime: LaneRuntime }) {
  const tps = Math.round(runtime.smoothedTps);
  // Gauge maps 0..2000 tok/s onto -90°..+90°.
  const frac = Math.min(1, runtime.smoothedTps / 2000);
  const needleRot = -90 + frac * 180;
  const dashOffset = 40 + frac * 86; // fill the faint arc

  const clearedPct = Math.min(100, runtime.cleared * 3.2);
  const backlogPct = Math.min(100, runtime.backlog * 11);

  return (
    <div className="hud grid items-center gap-3 mt-3 bg-black/20 border border-white/5 rounded-[10px] px-3 py-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
      <div className="gauge w-24 text-center">
        <svg viewBox="0 0 96 54" className="w-24 h-[54px] block mx-auto">
          <path d="M8 48 A40 40 0 0 1 88 48" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="7" strokeLinecap="round" />
          <path
            d="M8 48 A40 40 0 0 1 88 48"
            fill="none"
            stroke="var(--c)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="126"
            strokeDashoffset={dashOffset}
            opacity="0.25"
          />
          <line
            className="needle"
            x1="48"
            y1="48"
            x2="48"
            y2="16"
            stroke="var(--c)"
            strokeWidth="3"
            strokeLinecap="round"
            style={{ transformOrigin: '48px 48px', transform: `rotate(${needleRot}deg)`, transition: 'transform .25s ease' }}
          />
          <circle cx="48" cy="48" r="4" fill="var(--c)" />
        </svg>
        <div className="tokps font-hud font-extrabold text-[19px] leading-none -mt-1" style={{ color: 'var(--c)' }}>
          {tps.toLocaleString()} <small className="text-[10.5px] text-[#8A93A3] font-medium">tok/s</small>
        </div>
      </div>

      <div className="hud-right flex flex-col gap-[7px]">
        <div>
          <div className="meter-row flex items-center justify-between font-hud text-[12px] text-[#8A93A3]">
            <span>Cleared</span>
            <b className="text-white font-bold">{runtime.cleared}</b>
          </div>
          <div className="bar h-[7px] rounded bg-white/[0.06] overflow-hidden mt-[3px]">
            <i className="block h-full rounded" style={{ width: `${clearedPct}%`, background: '#46C46E', transition: 'width .35s ease' }} />
          </div>
        </div>
        <div>
          <div className="meter-row flex items-center justify-between font-hud text-[12px] text-[#8A93A3]">
            <span>Backlog</span>
            <b className="text-white font-bold">{runtime.backlog}</b>
          </div>
          <div className="bar h-[7px] rounded bg-white/[0.06] overflow-hidden mt-[3px]">
            <i className="block h-full rounded" style={{ width: `${backlogPct}%`, background: '#F5A623', transition: 'width .35s ease' }} />
          </div>
        </div>
        <div className="stat-chips flex gap-1.5 flex-wrap mt-0.5">
          <Chip label="checker caught" value={runtime.caught} />
          <Chip label="escalated" value={runtime.escalated} />
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className="chip font-hud text-[11px] text-[#8A93A3] bg-white/[0.04] border border-white/[0.06] rounded-[5px] px-1.5 py-0.5">
      {label} <b className="text-white">{value}</b>
    </span>
  );
}
