/**
 * Scoreboard — the top score readout + timer (§9 top strip).
 *
 * Now lane-count-agnostic: one TeamBlock per lane (Cerebras, Challenger, GPU,
 * and Gemini when present) with the timer centered. The score is items resolved
 * × accuracy, encoded so speed IS the game.
 */
import { useArena } from '../store/arena';
import { totalScore } from '../engine/scoring';
import { MODE_CONFIG } from '../engine/arrivalPump';

const LANE_META: Record<string, { sub: string; color: string; score: string; glow: string }> = {
  cerebras: { sub: 'wafer-scale', color: 'text-cerebras-orange', score: 'text-[#ffd9c9]', glow: '0 0 22px rgba(239,90,42,0.45)' },
  gpu: { sub: 'GPU-hosted', color: 'text-challenger-blue', score: 'text-[#cfe0ff]', glow: '0 0 22px rgba(60,123,242,0.45)' },
  gemini: { sub: 'Flash Lite', color: 'text-cleared-green', score: 'text-[#bff5cf]', glow: '0 0 22px rgba(70,196,110,0.45)' },
  human: { sub: 'you', color: 'text-[#cfd6e2]', score: 'text-white', glow: '0 0 22px rgba(207,214,226,0.35)' },
};

export function Scoreboard() {
  const lanes = useArena((s) => s.lanes);
  const timeLeft = useArena((s) => s.timeLeft);
  const mode = useArena((s) => s.mode);
  const duration = MODE_CONFIG[mode].durationSec;
  const endless = mode === 'endless';
  const effective = timeLeft > 0 ? timeLeft : duration;

  // For endless, show elapsed (duration - timeLeft grows over time). For fixed
  // windows, show remaining. Both render M:SS.
  const remaining = endless ? duration - timeLeft : effective;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeLabel = endless ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins}:${String(secs).padStart(2, '0')}`;

  const list = Object.values(lanes);
  const low = !endless && effective <= 10;

  return (
    <div className="relative z-[5] flex items-end justify-center gap-4 px-5 pt-[14px] pb-2.5 flex-wrap">
      {list.map((lane) => {
        const score = totalScore(lane.runtime.items);
        const meta = LANE_META[lane.id] ?? LANE_META.human;
        return (
          <div key={lane.id} className="flex flex-col gap-0.5 items-center text-center min-w-[110px]">
            <span className={`font-sig uppercase tracking-[0.12em] text-[15px] ${meta.color}`}>● {lane.name}</span>
            <span
              className={`font-hud font-extrabold text-[clamp(30px,4.6vw,52px)] leading-[0.9] tracking-[0.02em] tabular-nums ${meta.score}`}
              style={{ textShadow: meta.glow }}
            >
              {score.toLocaleString()}
            </span>
            <span className="font-hud text-[11.5px] text-[#8A93A3]">{meta.sub}</span>
          </div>
        );
      })}

      <div className="flex flex-col items-center gap-1 min-w-[120px] self-center">
        <span className="font-sig uppercase tracking-[0.24em] text-[10.5px] text-[#828b99]">
          {endless ? 'Elapsed' : 'Time'}
        </span>
        <span
          className={`font-hud font-extrabold text-[clamp(26px,4vw,42px)] text-white tabular-nums tracking-[0.04em] ${low ? 'timer-low text-overflow-amber' : ''}`}
        >
          {endless ? '∞ ' : ''}{timeLabel}
        </span>
      </div>

      <div className="w-full text-center font-hud text-[11.5px] text-[#828b99] pt-0.5">
        score = parcels resolved × accuracy · same scenarios, graded identically
      </div>
    </div>
  );
}
