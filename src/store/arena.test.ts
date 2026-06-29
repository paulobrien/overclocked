/**
 * arena store tests — the Zustand store that holds all match state.
 *
 * Covers the actions the UI calls: start (with/without mode override), reset,
 * endEarly, and the _onEnd summary aggregation (winner, scores, resolved counts,
 * verdict accuracy, ROI). Uses fake timers + mock lanes so no network is needed.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { useArena } from './arena';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  useArena.getState().reset();
});
afterEach(() => {
  useArena.getState().reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('arena store — phase + start/reset', () => {
  it('starts in the lobby', () => {
    expect(useArena.getState().phase).toBe('lobby');
  });

  it('start() moves to running and creates lanes (mock by default)', () => {
    useArena.getState().start();
    const s = useArena.getState();
    expect(s.phase).toBe('running');
    expect(Object.keys(s.lanes).length).toBeGreaterThanOrEqual(2); // cerebras + gpu (+ gemini)
    expect(s.engine).not.toBeNull();
  });

  it('start(mode) overrides the run config mode', () => {
    useArena.getState().start('blitz');
    expect(useArena.getState().mode).toBe('blitz');
  });

  it('reset() returns to lobby and clears state', () => {
    useArena.getState().start();
    useArena.getState().reset();
    const s = useArena.getState();
    expect(s.phase).toBe('lobby');
    expect(s.engine).toBeNull();
    expect(s.lanes).toEqual({});
    expect(s.summary).toBeNull();
  });
});

describe('arena store — endEarly + summary', () => {
  it('endEarly ends the race and synthesizes a summary', async () => {
    useArena.getState().start();
    // let a few items process so there's something to summarize
    await vi.advanceTimersByTimeAsync(4000);
    useArena.getState().endEarly();
    const s = useArena.getState();
    expect(s.phase).toBe('ended');
    expect(s.summary).not.toBeNull();
    expect(s.summary!.scores).toBeDefined();
    expect(s.summary!.winnerId).toBeTruthy();
    expect(typeof s.summary!.margin).toBe('number');
    expect(s.summary!.roiSavedGbp).toBeGreaterThanOrEqual(0);
  });
});

describe('arena store — config + toggles', () => {
  it('setRunConfig merges patches', () => {
    useArena.getState().setRunConfig({ mode: 'extended' });
    expect(useArena.getState().runConfig.mode).toBe('extended');
  });

  it('toggleCinematic / toggleSound flip booleans', () => {
    const c0 = useArena.getState().cinematic;
    const s0 = useArena.getState().soundOn;
    useArena.getState().toggleCinematic();
    useArena.getState().toggleSound();
    expect(useArena.getState().cinematic).toBe(!c0);
    expect(useArena.getState().soundOn).toBe(!s0);
  });
});
