/**
 * Arena store (Zustand) — holds the game state React subscribes to (§2, §3).
 *
 * The engine drives the store via callbacks; React subscribes and renders.
 * Selectors keep re-renders narrow. This is the single source of truth for the
 * whole match: queue depth, lane runtimes, scores, timer, phase, run config.
 */
import { create } from 'zustand';
import type { CoordinationTrace, GradeResult, PipelineStepTrace, TaskType, Verdict } from '../shared/contract';
import { GameEngine, type LaneConfig, type LaneRuntime } from '../engine/loop';
import { makeCerebrasClient, makeOpenRouterClient, makeNvidiaClient, makeGeminiClient, makeMockClient, makeHumanClient, MOCK_PROFILES, type HumanResolver } from '../agents/clients';
import type { Mode } from '../engine/arrivalPump';
import { roiSavedFor } from '../orchestrator/policy';
import { totalScore, meanTokensPerSec, resolvedCount, verdictAccuracy } from '../engine/scoring';
import type { CorrectOutcome } from '../shared/contract';
import { humanResolver as defaultHumanResolver } from '../stage/humanInput';
import { stopAllAudio } from '../audio/sfx';

export type Phase = 'lobby' | 'countdown' | 'running' | 'ended';

export interface LaneView {
  id: string;
  name: string;
  runtime: LaneRuntime;
  liveFocus?: LaneRuntime['focus'];
}

export interface RunConfig {
  mode: Mode;
  useMock: boolean; // fake-first: race mock lanes (no API calls)
  cerebrasModel?: string;
  challengerModel?: string;
  /** Which GPU-hosted provider the challenger lane runs on (live mode). Both
   *  serve the same Gemma 4 31B, so it stays a pure silicon-vs-silicon race. */
  challengerProvider: 'openrouter' | 'nvidia';
  geminiModel?: string;
  includeGemini: boolean; // the Gemini "bottom production line" — off by default
  includeHuman: boolean;
  depth: 'single' | 'full';
}

export interface MatchSummary {
  winnerId: string;
  scores: Record<string, number>;
  cleared: Record<string, number>;
  tokensPerSec: Record<string, number>;
  accuracy: Record<string, number>;
  roiSavedGbp: number;
  totalCleared: number;
  margin: number; // winner score / loser score
}

interface ArenaState {
  phase: Phase;
  timeLeft: number;
  mode: Mode;
  runConfig: RunConfig;
  lanes: Record<string, LaneView>;
  summary: MatchSummary | null;
  cinematic: boolean;
  soundOn: boolean;
  engine: GameEngine | null;
  humanResolver: HumanResolver | null;

  setRunConfig: (patch: Partial<RunConfig>) => void;
  setHumanResolver: (r: HumanResolver) => void;
  toggleCinematic: () => void;
  toggleSound: () => void;
  start: (mode?: Mode) => void;
  reset: () => void;
  endEarly: () => void;
  _onLaneUpdate: (laneId: string, runtime: LaneRuntime) => void;
  _onTick: (timeLeft: number) => void;
  _onEnd: (results: Record<string, LaneRuntime>) => void;
}

const defaultRunConfig: RunConfig = {
  mode: 'standard',
  useMock: true, // start fake-first; flip off to hit real APIs
  cerebrasModel: undefined,
  challengerModel: undefined,
  challengerProvider: 'openrouter', // OpenRouter by default; NVIDIA NIM is selectable
  geminiModel: undefined,
  includeGemini: false, // headline race is Cerebras vs the GPU challenger; Gemini is opt-in
  includeHuman: false,
  depth: 'full',
};

function buildLaneConfigs(cfg: RunConfig, humanResolver: HumanResolver | null): LaneConfig[] {
  const lanes: LaneConfig[] = [];
  if (cfg.useMock) {
    lanes.push({ id: 'cerebras', name: 'Cerebras', client: makeMockClient('Cerebras', MOCK_PROFILES.cerebras), depth: cfg.depth });
    lanes.push({ id: 'gpu', name: 'Challenger', client: makeMockClient('Challenger', MOCK_PROFILES.gpu), depth: cfg.depth });
    if (cfg.includeGemini) {
      lanes.push({ id: 'gemini', name: 'Gemini', client: makeMockClient('Gemini', MOCK_PROFILES.gemini), depth: cfg.depth });
    }
  } else {
    lanes.push({
      id: 'cerebras',
      name: 'Cerebras',
      client: makeCerebrasClient(cfg.cerebrasModel),
      provider: { provider: 'cerebras', model: cfg.cerebrasModel, temperature: 0.2, maxTokens: 512 },
      depth: cfg.depth,
    });
    const challengerIsNvidia = cfg.challengerProvider === 'nvidia';
    lanes.push({
      id: 'gpu',
      name: 'Challenger',
      client: challengerIsNvidia ? makeNvidiaClient(cfg.challengerModel) : makeOpenRouterClient(cfg.challengerModel),
      provider: { provider: challengerIsNvidia ? 'nvidia' : 'openrouter', model: cfg.challengerModel, temperature: 0.2, maxTokens: 512 },
      depth: cfg.depth,
    });
    if (cfg.includeGemini) {
      lanes.push({
        id: 'gemini',
        name: 'Gemini',
        client: makeGeminiClient(cfg.geminiModel),
        provider: { provider: 'gemini', model: cfg.geminiModel, temperature: 0.2, maxTokens: 512 },
        depth: cfg.depth,
      });
    }
  }
  if (cfg.includeHuman) {
    const resolver = humanResolver ?? defaultHumanResolver;
    lanes.push({ id: 'human', name: 'Human', client: makeHumanClient(resolver), depth: 'single' });
  }
  return lanes;
}

export const useArena = create<ArenaState>((set, get) => ({
  phase: 'lobby',
  timeLeft: 0,
  mode: 'standard',
  runConfig: defaultRunConfig,
  lanes: {},
  summary: null,
  cinematic: false,
  soundOn: true,
  engine: null,
  humanResolver: null,

  setRunConfig: (patch) => set((s) => ({ runConfig: { ...s.runConfig, ...patch }, mode: patch.mode ?? s.runConfig.mode })),
  setHumanResolver: (r) => set({ humanResolver: r }),
  toggleCinematic: () => set((s) => ({ cinematic: !s.cinematic })),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),

  start: (mode) => {
    const { runConfig, humanResolver } = get();
    // Allow the caller to override the mode (e.g. clicking a preset in the Stage).
    const effectiveMode = mode ?? runConfig.mode;
    const effectiveConfig = { ...runConfig, mode: effectiveMode };
    get().reset();
    const laneConfigs = buildLaneConfigs(effectiveConfig, humanResolver);
    const engine = new GameEngine(
      { mode: effectiveMode, lanes: laneConfigs },
      {
        onLaneUpdate: (id, rt) => get()._onLaneUpdate(id, rt),
        onTick: (t) => get()._onTick(t),
        onEnd: (res) => get()._onEnd(res),
      },
    );
    const lanes: Record<string, LaneView> = {};
    for (const lc of laneConfigs) lanes[lc.id] = { id: lc.id, name: lc.name, runtime: emptyRuntime() };
    set({ engine, lanes, phase: 'running', mode: effectiveMode, runConfig: effectiveConfig, summary: null });
    engine.start();
  },

  reset: () => {
    const { engine } = get();
    if (engine) engine.stop();
    stopAllAudio(); // returning to the lobby: kill the conveyor hum + any sound
    set({ engine: null, phase: 'lobby', lanes: {}, summary: null, timeLeft: 0 });
  },

  endEarly: () => {
    get().engine?.stop();
    // synthesize an end from current state
    const lanes = get().lanes;
    const results: Record<string, LaneRuntime> = {};
    for (const [id, v] of Object.entries(lanes)) results[id] = v.runtime;
    get()._onEnd(results);
  },

  _onLaneUpdate: (laneId, runtime) =>
    set((s) => {
      const existing = s.lanes[laneId];
      if (!existing) return {};
      return { lanes: { ...s.lanes, [laneId]: { ...existing, runtime, liveFocus: runtime.focus } } };
    }),

  _onTick: (timeLeft) => set({ timeLeft }),

  _onEnd: (results) => {
    stopAllAudio(); // the round is over — stop the conveyor hum
    const scores: Record<string, number> = {};
    const cleared: Record<string, number> = {};
    const tps: Record<string, number> = {};
    const acc: Record<string, number> = {};
    for (const [id, rt] of Object.entries(results)) {
      scores[id] = totalScore(rt.items);
      cleared[id] = resolvedCount(rt.items);
      tps[id] = Math.round(meanTokensPerSec(rt.items));
      acc[id] = verdictAccuracy(rt.items);
    }
    const ids = Object.keys(scores);
    // A lane that tripped offline can't win — pick the winner among the lanes
    // that actually finished the race (fall back to all if every lane died).
    const liveIds = ids.filter((id) => !results[id].offline);
    const pool = liveIds.length ? liveIds : ids;
    let winnerId = pool[0];
    for (const id of pool) if (scores[id] > scores[winnerId]) winnerId = id;
    const loserScore = Math.max(1, ...pool.filter((i) => i !== winnerId).map((i) => scores[i]));
    const totalCleared = Object.values(cleared).reduce((a, b) => a + b, 0);
    set({
      phase: 'ended',
      summary: {
        winnerId,
        scores,
        cleared,
        tokensPerSec: tps,
        accuracy: acc,
        roiSavedGbp: roiSavedFor(totalCleared),
        totalCleared,
        margin: scores[winnerId] / loserScore,
      },
    });
  },
}));

function emptyRuntime(): LaneRuntime {
  return {
    queue: [],
    backlog: 0,
    cleared: 0,
    caught: 0,
    escalated: 0,
    score: 0,
    tokensPerSec: 0,
    smoothedTps: 0,
    busy: false,
    itemNo: 8800,
    focus: null,
    lastItems: [],
    items: [],
    offline: false,
  };
}

// Re-export shared types used by UI
export type { LaneRuntime, LaneConfig, LaneFocus } from '../engine/loop';
export type { GradeResult, PipelineStepTrace, TaskType, Verdict, CoordinationTrace, CorrectOutcome };
