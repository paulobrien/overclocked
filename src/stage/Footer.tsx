/**
 * Footer — the ROI payoff card + controls (§9 bottom strip).
 *
 * The ROI line ("X parcels cleared · est. £Z saved vs manual") is the enterprise
 * punchline. The cinematic toggle hides this + debug UI for clean recording (§11).
 */
import { useArena } from '../store/arena';
import { roiSavedFor } from '../orchestrator/policy';
import { resolvedCount } from '../engine/scoring';
import { play } from '../audio/sfx';
import { AgentRoster } from './AgentRoster';

export function Footer() {
  const lanes = useArena((s) => s.lanes);
  const cinematic = useArena((s) => s.cinematic);
  const toggleCinematic = useArena((s) => s.toggleCinematic);
  const toggleSound = useArena((s) => s.toggleSound);
  const soundOn = useArena((s) => s.soundOn);

  // Use the same "resolved correctly" definition the win-screen summary uses, so
  // the live ROI card and the final summary agree for the same run.
  const totalCleared = Object.values(lanes).reduce((sum, l) => sum + resolvedCount(l.runtime.items), 0);
  const roi = roiSavedFor(totalCleared);

  return (
    <div className="footer relative z-[5] flex items-center justify-between gap-3 px-5 py-3 border-t border-white/5" style={{ background: 'linear-gradient(180deg,transparent,rgba(0,0,0,0.25))' }}>
      <div className="play-cta font-sig uppercase tracking-[0.16em] text-[12.5px] text-white flex items-center gap-2">
        <span className="key font-hud font-bold text-[11px] bg-white/10 border border-white/15 rounded-[5px] px-2 py-[3px]" style={{ boxShadow: '0 2px 0 rgba(0,0,0,0.4)' }}>
          C
        </span>
        Cinematic mode
      </div>

      {/* agent legend — maps the live pipeline steps to the agents behind them */}
      <div className="flex-1 flex justify-center">
        <AgentRoster variant="compact" />
      </div>

      <div className="roi font-hud text-[12.5px] text-cleared-green">
        Cleared <b className="text-[#bff5cf]">{totalCleared}</b> parcels · est. <b className="text-[#bff5cf]">£{roi.toLocaleString()}</b> saved vs. manual
      </div>

      <div className="controls flex gap-2">
        <button
          onClick={() => {
            toggleSound();
            setSoundOnEffect(!soundOn);
          }}
          className="btn ghost font-sig uppercase tracking-[0.12em] text-[11px] cursor-pointer text-white bg-white/[0.06] border-none rounded-[7px] px-4 py-2 font-semibold"
          style={{ boxShadow: '0 4px 0 rgba(0,0,0,0.4)' }}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
        <button
          onClick={() => {
            toggleCinematic();
            play('coin');
          }}
          className={`btn font-sig uppercase tracking-[0.12em] text-[11px] cursor-pointer text-[#1A1F2B] border-none rounded-[7px] px-4 py-2 font-semibold ${cinematic ? 'bg-cerebras-orange' : 'bg-white'}`}
          style={{ boxShadow: '0 4px 0 rgba(0,0,0,0.4)' }}
        >
          {cinematic ? 'Exit' : 'Cinematic'}
        </button>
      </div>
    </div>
  );
}

// Bridge to the audio module's enabled flag (kept separate from store so audio
// never imports the store and stays framework-free).
import { setSoundEnabled } from '../audio/sfx';
function setSoundOnEffect(on: boolean) {
  setSoundEnabled(on);
}
