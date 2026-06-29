/**
 * Banner — the end-of-round win screen (§9, §11 payoff beat).
 *
 * Shows the winner, the score + throughput multiplier, and the ROI line, then
 * fires a confetti burst (canvas-confetti) and the win fanfare. The logo/
 * enterprise punchline lands last per the beat sheet.
 */
import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useArena } from '../store/arena';
import { play } from '../audio/sfx';
import { Logo } from './Logo';

export function Banner() {
  const summary = useArena((s) => s.summary);
  const lanes = useArena((s) => s.lanes);
  const reset = useArena((s) => s.reset);

  useEffect(() => {
    if (!summary) return;
    const isCerebras = summary.winnerId === 'cerebras';
    play('win');
    const colors = isCerebras ? ['#EF5A2A', '#ffd9c9', '#fff'] : ['#3C7BF2', '#cfe0ff', '#fff'];
    const origin = { x: isCerebras ? 0.25 : 0.75, y: 0.5 };
    confetti({ particleCount: 160, spread: 90, origin, colors, scalar: 1.1 });
    setTimeout(() => confetti({ particleCount: 80, spread: 120, origin: { x: 0.5, y: 0.4 }, colors }), 250);
  }, [summary]);

  if (!summary) return null;

  const winnerName = lanes[summary.winnerId]?.name ?? summary.winnerId;
  const winnerColor = summary.winnerId === 'cerebras' ? '#EF5A2A' : summary.winnerId === 'gpu' ? '#3C7BF2' : '#46C46E';
  const winScore = summary.scores[summary.winnerId] ?? 0;
  const loserIds = Object.keys(summary.scores).filter((id) => id !== summary.winnerId);
  const loserScore = loserIds.length ? Math.max(...loserIds.map((id) => summary.scores[id])) : 0;
  const winTps = summary.tokensPerSec[summary.winnerId] ?? 0;

  return (
    <div
      className="banner absolute inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(8,11,18,0.82)', backdropFilter: 'blur(3px)', animation: 'fade .4s ease' }}
    >
      <div className="banner-card text-center px-6">
        <div className="flex justify-center mb-4 opacity-90">
          <Logo size="lg" showTag={false} />
        </div>
        <div
          className="win-team font-sig font-bold uppercase tracking-[0.12em] text-[clamp(30px,6vw,64px)]"
          style={{ color: winnerColor, textShadow: `0 0 40px ${winnerColor}88` }}
        >
          {winnerName.toUpperCase()} WINS
        </div>
        <div className="win-sub font-hud text-[14px] text-white mt-1.5">
          {winScore.toLocaleString()} vs {loserScore.toLocaleString()} · {summary.margin.toFixed(1)}× the throughput
        </div>
        <div className="win-roi font-hud text-[13px] text-cleared-green mt-3.5">
          {summary.totalCleared} parcels resolved correctly · est. £{summary.roiSavedGbp.toLocaleString()} saved vs. manual
        </div>
        <div className="win-tps font-hud text-[11px] text-[#8A93A3] mt-2">
          {winTps.toLocaleString()} tok/s peak · {Math.round(summary.accuracy[summary.winnerId] * 100)}% correct verdicts
        </div>
        <button
          onClick={reset}
          className="mt-6 font-sig uppercase tracking-[0.16em] text-[12px] cursor-pointer text-[#1A1F2B] bg-white border-none rounded-[7px] px-6 py-2.5 font-semibold"
          style={{ boxShadow: '0 4px 0 rgba(0,0,0,0.4)' }}
        >
          ↻ Race again
        </button>
      </div>
    </div>
  );
}
