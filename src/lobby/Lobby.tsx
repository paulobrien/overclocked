/**
 * Lobby — the "before GO" screen (§10).
 *
 * Two halves: a task explorer (browse the scenario pool, get a feel for the
 * work, see what's messy about each parcel) and the run config (pick the
 * challenger model, run time, pipeline depth, human lane, mock-vs-real). Sells
 * the realism and the stakes before the round starts.
 */
import { useState } from 'react';
import { allTaskTypes } from '../tasks/registry';
import { SCENARIOS } from '../data/scenarios';
import { useArena } from '../store/arena';
import { RunConfigPanel } from './RunConfig';
import { TaskExplorer } from './TaskExplorer';
import { AgentRoster } from '../stage/AgentRoster';
import { Logo } from '../stage/Logo';

export function Lobby() {
  const tasks = allTaskTypes();
  const [selectedTask, setSelectedTask] = useState(tasks[0].id);
  const start = useArena((s) => s.start);
  const runConfig = useArena((s) => s.runConfig);
  const setRunConfig = useArena((s) => s.setRunConfig);

  const taskScenarios = SCENARIOS.filter((s) => s.taskTypeId === selectedTask);
  const selected = tasks.find((t) => t.id === selectedTask)!;

  return (
    <div className="min-h-screen flex items-center justify-center p-[18px]">
      <div className="cabinet max-w-[1180px]">
        <div className="bezel">
          {/* header */}
          <div className="relative z-[5] px-6 py-5 border-b border-white/5">
            <div className="flex items-center justify-between">
              <Logo size="md" showTag={false} />
              <span className="font-sig uppercase tracking-[0.32em] text-[11px] text-[#8A93A3]">Lobby</span>
            </div>
            <p className="font-body text-[14px] text-[#8A93A3] mt-3 max-w-2xl">
              AI agents race to clear a real warehouse backlog — same model, different silicon. Browse the sortation
              line, pick the challenger, and hit <b className="text-white">GO</b>. Speed is the game.
            </p>
          </div>

          <div className="relative z-[5] grid gap-0" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
            <TaskExplorer
              tasks={tasks}
              selectedTask={selectedTask}
              onSelect={setSelectedTask}
              selected={selected}
              taskScenarios={taskScenarios}
            />
            <RunConfigPanel />
          </div>

          {/* How it works — the multi-agent coordination, surfaced for judges */}
          <div className="relative z-[5] px-6 py-5 border-t border-white/5">
            <div className="font-sig uppercase tracking-[0.18em] text-[13px] text-cerebras-orange mb-3">
              How it works · the agent graph
            </div>
            <p className="font-body text-[13px] text-[#8A93A3] mb-4 max-w-3xl">
              Each parcel isn't one model call — it's a small team of agents. Watch them work during the race:
              the pipeline steps in each focus card light up as the Router dispatches, the Worker extracts, the
              Verifier checks, and (when needed) the Exceptions Specialist steps in.
            </p>
            <AgentRoster variant="full" />
          </div>

          {/* GO bar */}
          <div className="relative z-[5] flex items-center justify-between gap-3 px-6 py-4 border-t border-white/5" style={{ background: 'linear-gradient(180deg,transparent,rgba(0,0,0,0.25))' }}>
            <div className="flex items-center gap-4">
              <div className="font-hud text-[12px] text-[#8A93A3]">
                {runConfig.useMock ? (
                  <span className="text-overflow-amber">● MOCK LANES — no API calls (fake-first)</span>
                ) : (
                  <span className="text-cleared-green">● LIVE — Cerebras vs GPU via Worker</span>
                )}
              </div>
              <button
                onClick={() => setRunConfig({ includeHuman: !runConfig.includeHuman })}
                className={`font-sig uppercase tracking-[0.14em] text-[12px] cursor-pointer rounded-[8px] px-4 py-2.5 font-bold border-2 transition-colors ${
                  runConfig.includeHuman
                    ? 'text-cleared-green border-cleared-green bg-cleared-green/10'
                    : 'text-[#8A93A3] border-white/15 hover:border-white/40 hover:text-white'
                }`}
                title="Add yourself as a third lane — race the bots on the same queue (you'll get crushed)"
              >
                🧑 I WANNA PLAY {runConfig.includeHuman ? '✓' : ''}
              </button>
            </div>
            <button
              onClick={() => start()}
              className="font-sig uppercase tracking-[0.2em] text-[16px] cursor-pointer text-[#1A1F2B] bg-cerebras-orange border-none rounded-[10px] px-10 py-3 font-bold"
              style={{ boxShadow: '0 6px 0 #7d3724, 0 0 30px rgba(239,90,42,0.4)' }}
            >
              ▶ GO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
