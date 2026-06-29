/**
 * Stage — the top-level arena view (§9 layout, one screen, mirrored lanes).
 *
 * Wraps everything in the coin-op cabinet chrome and lays out: marquee,
 * scoreboard, the two (or three) lanes, the footer with the ROI payoff card,
 * and the controls. Subscribes to the arena store and delegates per-lane work
 * to <Lane/>. Belt backups, handler stress, and live tokens/sec all derive
 * from the lane runtime in the store.
 */
import { useEffect } from 'react';
import { useArena } from '../store/arena';
import { Lane } from './Lane';
import { Scoreboard } from './Scoreboard';
import { Footer } from './Footer';
import { Controls } from './Controls';
import { Logo } from './Logo';
import { setCrowdIntensity, stopAllAudio, countdownBeat } from '../audio/sfx';
import { totalScore } from '../engine/scoring';

export function Stage() {
  const lanes = useArena((s) => s.lanes);
  const timeLeft = useArena((s) => s.timeLeft);
  const mode = useArena((s) => s.mode);
  const cinematic = useArena((s) => s.cinematic);
  const toggleCinematic = useArena((s) => s.toggleCinematic);
  const phase = useArena((s) => s.phase);

  // 'C' toggles cinematic mode (matches the Footer hint) — and crucially gives a
  // way OUT of cinematic, where the Footer (with its Exit button) is hidden.
  // Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      toggleCinematic();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCinematic]);

  const laneList = Object.values(lanes);
  // The human races to the RIGHT; the AI lanes are the main view to its left.
  const aiLanes = laneList.filter((l) => l.id !== 'human');
  const humanLane = laneList.find((l) => l.id === 'human');

  // The crown goes to the SINGLE current leader by score (the same score the
  // scoreboard shows), not to "any lane doing well" — so it tracks who's
  // actually winning. A tie (or all-zero) means no crown.
  const scored = laneList
    .filter((l) => !l.runtime.offline)
    .map((l) => ({ id: l.id, score: totalScore(l.runtime.items) }));
  const topScore = Math.max(0, ...scored.map((s) => s.score));
  const topLanes = scored.filter((s) => s.score === topScore && topScore > 0);
  const leaderId = topLanes.length === 1 ? topLanes[0].id : null;

  // The crowd swell (the conveyor hum) tracks the most-stressed lane — but only
  // while the race is actually running. When ended/back in the lobby, it's
  // silenced so the buzzing doesn't keep going on the results screen.
  const maxBacklog = Math.max(0, ...laneList.map((l) => l.runtime.backlog));
  const stress01 = Math.min(1, maxBacklog / 8);
  const racing = phase === 'running';
  useEffect(() => {
    // While racing, the hum tracks stress. Otherwise fully stop it — note
    // setCrowdIntensity(0) would leave (and even start) a 0.02 floor hum, so on
    // the ended screen we hard-stop instead.
    if (racing) setCrowdIntensity(stress01);
    else stopAllAudio();
  }, [stress01, racing]);

  // Belt-and-braces: kill all sound when the Stage unmounts (e.g. back to lobby).
  useEffect(() => () => stopAllAudio(), []);

  // Game-show countdown for the final 10 seconds of a timed race: one rising
  // tension beat per second (10..1). The effect only re-runs when timeLeft
  // changes (once/sec), so each second fires exactly one beat. Endless mode
  // counts up, so it's excluded.
  useEffect(() => {
    if (racing && mode !== 'endless' && timeLeft >= 1 && timeLeft <= 10) {
      countdownBeat(timeLeft);
    }
  }, [timeLeft, racing, mode]);

  // The human action column is wider; the AI lanes shrink to make room for it.
  const cols = humanLane
    ? `repeat(${aiLanes.length}, minmax(0, 1fr)) minmax(0, 1.5fr)`
    : `repeat(${aiLanes.length}, minmax(0, 1fr))`;

  const modeLabel: Record<string, string> = {
    blitz: '15s · Blitz',
    short: '30s · Short',
    standard: '60s · Standard',
    extended: '5 min · Extended',
    endless: 'Endless ∞',
    'sudden-death': 'Sudden Death',
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-[18px]">
      <div className="cabinet">
        <div className="bezel">
          <div className="scanlines" />
          <div className="vignette" />

          {/* Cinematic mode hides the footer/controls for clean recording — keep
              a subtle, always-available way out (the footer's Exit is hidden). */}
          {cinematic && (
            <button
              onClick={toggleCinematic}
              title="Exit cinematic mode (press C)"
              className="absolute bottom-4 right-4 z-[45] font-sig uppercase tracking-[0.1em] text-[12px] text-white bg-black/60 border border-white/25 rounded-lg px-4 py-2 opacity-75 hover:opacity-100 hover:border-white/50 transition-opacity cursor-pointer shadow-lg"
            >
              ✕ Exit cinematic <span className="text-white/50">(C)</span>
            </button>
          )}

          {/* marquee */}
          <div className="relative z-[5] flex items-center justify-between px-5 pt-[14px] pb-3 border-b border-white/5">
            <Logo size="md" />
            <div className="font-sig uppercase tracking-[0.18em] text-[13px] text-overflow-amber border border-[rgba(245,166,35,0.4)] rounded-full px-3.5 py-[6px] bg-[rgba(245,166,35,0.08)]">
              {modeLabel[mode] ?? '60s · Standard'}
            </div>
          </div>

          <Scoreboard />

          {/* arena — AI lanes (the main view), human action column to the right */}
          <div className="relative z-[5] grid gap-0" style={{ gridTemplateColumns: cols }}>
            {aiLanes.map((lane) => (
              <Lane key={lane.id} lane={lane} leading={lane.id === leaderId} />
            ))}
            {humanLane && <Lane key={humanLane.id} lane={humanLane} leading={humanLane.id === leaderId} />}
          </div>

          {!cinematic && <Footer />}

          {!cinematic && <Controls />}
        </div>
      </div>
    </div>
  );
}
