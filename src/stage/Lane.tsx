/**
 * Lane — one competitor's column (§9). Composes the belt, the handler booth,
 * the focus card, and the HUD. Stress state (calm → focused → strained →
 * drowning / winning) derives from backlog + score lead and drives the handler
 * character + the belt jam.
 */
import { useEffect, useRef } from 'react';
import { useArena, type LaneView } from '../store/arena';
import { Belt } from './Belt';
import { Handler } from './Handler';
import { FocusCard } from './FocusCard';
import { HUD } from './HUD';
import { HumanActionPanel } from './HumanOverlay';
import { play } from '../audio/sfx';

export function Lane({ lane, leading = false }: { lane: LaneView; leading?: boolean }) {
  const rt = lane.runtime;
  const challengerProvider = useArena((s) => s.runConfig.challengerProvider);
  const offline = rt.offline;
  const isCerebras = lane.id === 'cerebras';
  const isHuman = lane.id === 'human';
  const color = isCerebras ? 'cerebras-orange' : lane.id === 'gpu' ? 'challenger-blue' : 'cleared-green';
  // Each lane is a different animal — same animation machinery, different face.
  const animal: 'badger' | 'penguin' | 'panda' = isCerebras ? 'badger' : lane.id === 'gpu' ? 'penguin' : 'panda';

  // Stress bucket from backlog depth — drives the handler expression + belt jam.
  let stress: 0 | 1 | 2 | 3 = 0;
  if (rt.backlog > 6) stress = 3;
  else if (rt.backlog > 3) stress = 2;
  else if (rt.backlog > 1) stress = 1;
  if (offline) stress = 0;
  // The crown / champion pose belongs to the actual leader (passed from the
  // Stage, computed by score) — but a leader who's drowning still shows the
  // drowning beat rather than smugly flexing. An offline lane never poses.
  const winning = !offline && leading && stress < 3;

  // The sad-trombone fires once when a lane first tips into drowning (stress 3),
  // not every tick it stays there — the most on-brand comedic audio beat (§8).
  const prevStress = useRef<0 | 1 | 2 | 3>(stress);
  useEffect(() => {
    if (stress === 3 && prevStress.current !== 3) play('drown');
    prevStress.current = stress;
  }, [stress]);

  const laneBorder = isCerebras ? 'border-r border-white/5' : '';

  return (
    <div
      className={`lane relative px-[18px] pb-[18px] pt-1.5 min-w-0 ${laneBorder}`}
      data-stress={stress}
      data-winning={winning ? '1' : '0'}
      style={
        {
          // lane color CSS var consumed by children
          ['--c' as any]:
            color === 'cerebras-orange' ? '#EF5A2A' : color === 'challenger-blue' ? '#3C7BF2' : '#46C46E',
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between my-0.5 mb-2">
        <span className="lane-name flex items-center gap-2 font-sig uppercase tracking-[0.1em] text-[15px]">
          <i className="w-[10px] h-[10px] rounded-full" style={{ background: 'var(--c)', boxShadow: '0 0 10px var(--c)' }} />
          {lane.name}
        </span>
        {offline ? (
          <span className="silicon font-hud text-[11px] text-[#ff6f61] border border-[#ff6f61]/40 rounded-md px-[7px] py-0.5 flex items-center gap-1">
            ⏻ OFFLINE
          </span>
        ) : (
          <span className="silicon font-hud text-[11px] text-[#8A93A3] border border-white/10 rounded-md px-[7px] py-0.5">
            {isCerebras
              ? 'Gemma 4 31B · wafer-scale'
              : lane.id === 'gpu'
                ? `Gemma 4 31B · ${challengerProvider === 'nvidia' ? 'NVIDIA' : 'GPU'}`
                : lane.id === 'gemini'
                  ? 'Gemini 3.1 Flash Lite'
                  : 'click-to-classify'}
          </span>
        )}
      </div>

      <Belt backlog={rt.backlog} queueDepth={rt.queue.length} fast={isCerebras} offline={offline} />

      {offline ? (
        <div
          className="mt-3 rounded-[10px] border border-[#ff6f61]/30 px-4 py-5 text-center flex flex-col items-center justify-center"
          style={{ minHeight: 204, background: 'linear-gradient(180deg, rgba(42,22,20,0.55), rgba(26,18,16,0.55))' }}
        >
          <div className="font-sig uppercase tracking-[0.12em] text-[#ff8a7e] text-[15px]">⏻ Lane offline</div>
          <div className="font-hud text-[12.5px] text-[#e7b0a8] mt-1.5">{rt.offlineReason ?? 'Provider unavailable'}</div>
          <div className="font-hud text-[11px] text-[#8A93A3] mt-2 max-w-[280px]">
            The other lanes race on. Set this provider's API key + model id, then restart the round.
          </div>
        </div>
      ) : isHuman ? (
        <div className="mt-3">
          <HumanActionPanel />
        </div>
      ) : (
        <div className="floorstrip grid gap-3.5 mt-3 items-end" style={{ gridTemplateColumns: '164px minmax(0, 1fr)' }}>
          <Handler animal={animal} stress={stress} winning={winning} stamping={!!rt.focus?.stamping} />
          <FocusCard lane={lane} />
        </div>
      )}

      <HUD runtime={rt} />
    </div>
  );
}
