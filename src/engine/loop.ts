/**
 * Engine — framework-free, deterministic tick loop (§3).
 *
 * arrival pump → run per-item PIPELINE in each lane → grade final output →
 * update score/backlog/tokens-per-sec.
 *
 * The engine owns the cadence and drives the Zustand store. React subscribes
 * to the store; the engine never touches React. This separation is what makes
 * the loop testable and the UI swappable.
 *
 * Fake-first discipline: the engine runs start-to-finish on mock agents. If a
 * provider flakes during judging, switch a lane to its mock and it still races.
 */
import type { AgentClient, CoordinationTrace, GradeResult, PipelineStepTrace, TaskScenario, TaskType, Verdict } from '../shared/contract';
import type { ProviderConfig } from '../agents/streaming';
import { getTaskType } from '../tasks/registry';
import { runPipeline, type PipelineDepth } from '../orchestrator/pipeline';
import { scoreItem, type ScoredItem } from './scoring';
import { drawScenario, nextArrival, cloneScenario, type Mode, MODE_CONFIG } from './arrivalPump';

/** Consecutive provider failures before a lane is tripped OFFLINE (a clearly
 *  fatal error trips on the first failure regardless). Keeps a transient blip
 *  from killing a lane while still bailing out fast on a dead provider. */
export const OFFLINE_AFTER_FAILURES = 3;

/** New work is dispatched only when the fastest ONLINE lane's queue has drained
 *  below this depth. At 1, the pacemaker keeps an (almost) EMPTY belt — it's
 *  caught up, clearing work as fast as it arrives — while slower lanes pile up
 *  behind the same arrivals. The arrival rate adapts to whatever silicon leads. */
const ARRIVAL_GATE = 1;

/** How often the arrival pump checks whether to dispatch. Fast + gate-limited:
 *  the leader gets refilled promptly when it empties (so it never idles waiting),
 *  yet the GATE keeps the actual dispatch rate paced by the leader's throughput
 *  (so slower lanes still fall behind). */
const ARRIVAL_TICK_MS = 300;

export interface LaneConfig {
  id: 'cerebras' | 'gpu' | 'gemini' | 'human';
  name: string;
  client: AgentClient;
  provider?: ProviderConfig;
  depth: PipelineDepth;
}

export interface LaneRuntime {
  queue: TaskScenario[];
  backlog: number;
  cleared: number;
  caught: number;
  escalated: number;
  score: number;
  tokensPerSec: number;
  smoothedTps: number;
  busy: boolean;
  itemNo: number;
  focus: LaneFocus | null;
  lastItems: ScoredItem[];
  items: ScoredItem[];
  /** Tripped when a lane's provider keeps failing (missing key / bad model id /
   *  down Worker). An offline lane stops pulling work — the others race on and
   *  the fastest survivor sets the pace — instead of hammering a dead provider. */
  offline: boolean;
  offlineReason?: string;
}

export interface LaneFocus {
  scenario: TaskScenario;
  task: TaskType;
  steps: PipelineStepTrace[];
  fields: { key: string; label: string; value: unknown; ok?: boolean; visible: boolean }[];
  verdict?: Verdict;
  /** The verdict the agent SHOULD have stamped (answer key). */
  correctVerdict?: Verdict;
  /** Whether the agent's stamped verdict matched the correct one. */
  verdictCorrect?: boolean;
  /** One-line summary of the correct disposition. */
  correctSummary?: string;
  grade?: GradeResult;
  escalated: boolean;
  stamping: boolean;
  /** Set when the pipeline threw (provider error / missing key / bad model id).
   *  Surfaced on the focus card so a live failure is diagnosable on screen
   *  instead of looking like a legitimate verdict. */
  error?: string;
}

export interface EngineCallbacks {
  onLaneUpdate: (laneId: string, runtime: LaneRuntime) => void;
  onTick: (timeLeft: number) => void;
  onEnd: (results: Record<string, LaneRuntime>) => void;
}

export interface EngineOptions {
  mode: Mode;
  lanes: LaneConfig[];
  /** Smooth factor for the speedometer (0..1; higher = snappier). */
  smoothing?: number;
}

export class GameEngine {
  private runtimes = new Map<string, LaneRuntime>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private mode: Mode;
  private lanes: LaneConfig[];
  private smoothing: number;
  private timeLeft: number;
  private cb: EngineCallbacks;
  private running = false;
  private arrivalInterval: ReturnType<typeof setInterval> | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  /** Consecutive provider failures per lane — drives the offline circuit breaker. */
  private failStreak = new Map<string, number>();

  constructor(opts: EngineOptions, cb: EngineCallbacks) {
    this.mode = opts.mode;
    this.lanes = opts.lanes;
    this.smoothing = opts.smoothing ?? 0.25;
    this.timeLeft = MODE_CONFIG[this.mode].durationSec;
    this.cb = cb;

    // Seed EVERY lane from the SAME initial scenarios — fairness contract: all
    // lanes start with identical queues so only the silicon differs. Each lane
    // gets its own clone so there's no shared mutable state.
    const seedCount = 3;
    const seedBases: TaskScenario[] = Array.from({ length: seedCount }, () => drawScenario());

    for (const lane of this.lanes) {
      const runtime: LaneRuntime = {
        queue: seedBases.map((b) => cloneScenario(b)),
        backlog: 0,
        cleared: 0,
        caught: 0,
        escalated: 0,
        score: 0,
        tokensPerSec: 0,
        smoothedTps: 0,
        busy: false,
        itemNo: 8800 + Math.floor(Math.random() * 60),
        focus: null,
        lastItems: [],
        items: [],
        offline: false,
      };
      this.runtimes.set(lane.id, runtime);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startIntervals();
    // Kick each lane's processing loop.
    for (const lane of this.lanes) {
      const runtime = this.runtimes.get(lane.id)!;
      this.timers.push(setTimeout(() => this.processLane(lane, runtime), 200 + Math.random() * 300));
      this.emit(lane.id);
    }
  }

  /** Wire up the arrival pump + master tick. There is no pause — the lanes are
   *  live agents, so freezing the clock can't freeze in-flight model calls; a run
   *  is ended (scored) or reset, never paused. */
  private startIntervals() {
    const cfg = MODE_CONFIG[this.mode];

    // Arrival pump — ONE scenario per dispatch, broadcast to ALL online lanes as
    // identical clones (the fairness contract: every lane gets the same task at
    // the same instant, so the only variable is the silicon). The pool is drawn
    // randomly forever (endless) — it never exhausts.
    //
    // PACING: a dispatch only fires when the fastest online lane is ready for
    // more work (its queue has drained below ARRIVAL_GATE). That lane is the
    // pacemaker — it sets the tempo, so it never builds a backlog; slower lanes
    // get the same arrivals but can't keep up and fall behind. When a lane drops
    // offline it stops pacing, so the next-fastest survivor takes over the tempo.
    const laneIds = this.lanes.map((l) => l.id);
    this.arrivalInterval = setInterval(() => {
      if (!this.running) return;

      // The pacemaker = the fastest online competitor (the lane with the
      // shortest queue). Prefer the AI lanes; a human lane is meant to fall
      // behind, so it doesn't set the pace unless it's all that's left.
      const online = this.lanes.filter((l) => !this.runtimes.get(l.id)!.offline);
      const pacers = online.filter((l) => l.id !== 'human');
      const pool = pacers.length ? pacers : online;
      if (!pool.length) return; // everyone offline — nothing to dispatch
      const leaderQueue = Math.min(...pool.map((l) => this.runtimes.get(l.id)!.queue.length));
      if (leaderQueue >= ARRIVAL_GATE) return; // fastest lane still has a buffer — hold

      const arrivals = nextArrival(laneIds);
      this.lanes.forEach((lane, i) => {
        const rt = this.runtimes.get(lane.id)!;
        if (rt.offline) return; // a dead lane doesn't accumulate work
        if (rt.queue.length >= cfg.arrival.maxQueue) {
          rt.backlog++;
        } else {
          rt.queue.push(arrivals[i]);
        }
        this.emit(lane.id);
      });
    }, ARRIVAL_TICK_MS);

    // Master tick — countdown + sudden-death ramp + smoothing decay. Endless
    // mode never ends: it counts elapsed time UP (negative timeLeft signals
    // "elapsed" to the UI) and never fires end().
    const endless = this.mode === 'endless';
    this.tickInterval = setInterval(() => {
      if (!this.running) return;
      if (endless) {
        // Count up (negative = elapsed). UI shows ∞ / elapsed.
        this.timeLeft--;
        this.cb.onTick(this.timeLeft);
      } else {
        this.timeLeft--;
        this.cb.onTick(this.timeLeft);
        if (this.timeLeft <= 0) {
          this.end();
          return;
        }
      }

      // Sudden death: accelerate arrivals as time runs out (shared, fair).
      if (this.mode === 'sudden-death' && this.timeLeft > 0 && this.timeLeft % 6 === 0) {
        const extra = nextArrival(laneIds);
        this.lanes.forEach((lane, i) => {
          const rt = this.runtimes.get(lane.id)!;
          if (rt.offline) return;
          rt.queue.push(extra[i]);
          this.emit(lane.id);
        });
      }

      // No needle decay while racing: a lane (even a fast one that's briefly
      // caught up) holds its real rate. The speedometer only falls when a lane
      // goes offline (zeroed on trip) or the round ends (engine stops).
    }, 1000);
  }

  stop() {
    this.running = false;
    if (this.arrivalInterval) clearInterval(this.arrivalInterval);
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private ended = false;
  private end() {
    // Idempotent: a final tick firing at 0 + a manual endEarly() could otherwise
    // double-fire onEnd (double confetti / double summary).
    if (this.ended) return;
    this.ended = true;
    this.stop();
    const results: Record<string, LaneRuntime> = {};
    for (const [id, rt] of this.runtimes) results[id] = rt;
    this.cb.onEnd(results);
  }

  /** Per-lane item processing loop: pull → pipeline → grade → score → repeat. */
  private async processLane(lane: LaneConfig, rt: LaneRuntime) {
    if (!this.running) return;
    if (rt.offline) return; // tripped out — stop pulling work entirely
    if (rt.busy) return;
    if (rt.queue.length === 0) {
      this.timers.push(setTimeout(() => this.processLane(lane, rt), 200));
      return;
    }

    rt.busy = true;
    const scenario = rt.queue.shift()!;
    rt.itemNo++;
    const task = getTaskType(scenario.taskTypeId);

    // Initialize the focus card for this item.
    rt.focus = {
      scenario,
      task,
      steps: [
        { id: 'route', label: 'Route', status: 'pending' },
        { id: 'work', label: 'Work', status: 'pending' },
        { id: 'check', label: 'Check', status: 'pending' },
        { id: 'decide', label: 'Decide', status: 'pending' },
      ],
      fields: (task.focusFields ?? []).map((f) => ({ key: f.key, label: f.label, value: undefined, visible: false })),
      escalated: false,
      stamping: false,
    };
    this.emit(lane.id);

    try {
      const outcome = await runPipeline(scenario, task, {
        depth: lane.depth,
        provider: lane.provider,
        client: lane.client,
        onStep: (step) => {
          if (!rt.focus) return;
          const idx = rt.focus.steps.findIndex((s) => s.id === step.id);
          if (idx >= 0) rt.focus.steps[idx] = { ...step };
          this.emit(lane.id);
        },
        onToken: (tps) => {
          rt.tokensPerSec = tps;
          // Seed on the first report so the needle jumps straight to the real
          // rate (a slow lane reporting once per item shouldn't crawl up from 0).
          rt.smoothedTps = rt.smoothedTps > 0 ? rt.smoothedTps * (1 - this.smoothing) + tps * this.smoothing : tps;
          this.emit(lane.id);
        },
      });

      // The pipeline awaited real model calls (can take seconds). If the round
      // ended while we were waiting, drop this item — emitting a stale update
      // after onEnd would corrupt the ended-state view (M1).
      if (!this.running) return;

      const trace: CoordinationTrace = outcome.trace;
      const grade = scoreItem(task, outcome.output, scenario.groundTruth, scenario.correctOutcome, trace.verdict);

      // Reveal fields on the focus card.
      if (rt.focus) {
        rt.focus.verdict = trace.verdict;
        rt.focus.correctVerdict = scenario.correctOutcome.verdict;
        rt.focus.verdictCorrect = grade.verdictCorrect;
        rt.focus.correctSummary = scenario.correctOutcome.summary;
        rt.focus.grade = grade;
        rt.focus.escalated = trace.escalated;
        rt.focus.stamping = true;
        for (const field of rt.focus.fields) {
          const got = (outcome.output as Record<string, unknown>)?.[field.key];
          const expected = (scenario.groundTruth as Record<string, unknown>)[field.key];
          field.value = got;
          field.ok = grade.fields?.find((f) => f.key === field.key)?.ok ?? (got != null && String(got) === String(expected));
          field.visible = true;
        }
      }
      this.emit(lane.id);

      // Hold the stamp a beat for the THWACK, then clear focus.
      await sleep(420);
      if (rt.focus) rt.focus.stamping = false;

      // Update score + stats. Wrong answers score 0 but still cost the time.
      rt.score += grade.partial > 0 ? grade.scoreDelta : 0;
      rt.cleared += grade.resolved ? 1 : 0;
      rt.caught += trace.caught;
      rt.escalated += trace.escalated ? 1 : 0;
      // Clearing an item eases the backlog a touch.
      if (rt.backlog > 0) rt.backlog = Math.max(0, rt.backlog - 1);

      const scored: ScoredItem = {
        scenarioId: scenario.id,
        taskTypeId: task.id,
        difficulty: task.difficulty,
        grade,
        verdict: trace.verdict,
        correctVerdict: scenario.correctOutcome.verdict,
        verdictCorrect: grade.verdictCorrect,
        resolved: grade.resolved,
        latencyMs: outcome.totalLatencyMs,
        tokensPerSec: outcome.tokensPerSec,
      };
      rt.lastItems.push(scored);
      if (rt.lastItems.length > 8) rt.lastItems.shift();
      rt.items.push(scored);
      this.failStreak.set(lane.id, 0); // a good item clears the failure streak
    } catch (err) {
      // A provider/pipeline error: surface it on the focus card instead of
      // stamping a misleading verdict, so a bad model id / missing key / down
      // Worker is diagnosable on screen rather than looking like a legitimate
      // HOLD. The item still costs time (no score, no clear → the lane falls
      // behind, which is itself a signal).
      console.warn(`[engine] lane ${lane.id} item failed:`, err);
      if (rt.focus) {
        rt.focus.error = friendlyError(err);
        rt.focus.stamping = false;
        rt.focus.verdict = undefined;
        const work = rt.focus.steps.find((s) => s.id === 'work');
        if (work) work.status = 'fail';
      }

      // Circuit breaker: a clearly-fatal error (missing key / unconfigured
      // provider / unreachable Worker) trips immediately; otherwise we tolerate a
      // few consecutive failures before giving up. Tripping a lane OFFLINE stops
      // it pulling work — so we don't hammer a dead provider and flood the
      // console — while the other lanes race on and the fastest survivor paces.
      const streak = (this.failStreak.get(lane.id) ?? 0) + 1;
      this.failStreak.set(lane.id, streak);
      if (isFatalProviderError(err) || streak >= OFFLINE_AFTER_FAILURES) {
        rt.offline = true;
        rt.offlineReason = friendlyError(err);
        rt.queue = [];
        rt.backlog = 0;
        rt.busy = false;
        rt.tokensPerSec = 0;
        rt.smoothedTps = 0;
        // One lane dropping out re-paces the race: clear the survivors' backlogs
        // so the new fastest lane starts clean and becomes the pacemaker (it
        // shouldn't inherit a jam caused by the now-dead lane's tempo).
        for (const [id, other] of this.runtimes) {
          if (id === lane.id || other.offline) continue;
          other.backlog = 0;
          this.emit(id);
        }
        this.emit(lane.id);
        return; // do NOT reschedule — this lane is out
      }
    }

    rt.busy = false;
    this.emit(lane.id);
    // Pace the next item slightly so the belt reads — UNIFORM across lanes, so a
    // lane's speed comes only from its model latency, never an engine head start
    // (otherwise two identical lanes wouldn't converge).
    this.timers.push(setTimeout(() => this.processLane(lane, rt), 130));
  }

  private emit(laneId: string) {
    const rt = this.runtimes.get(laneId);
    if (rt) this.cb.onLaneUpdate(laneId, rt);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Map a thrown pipeline error to a short, demo-readable message. The streaming
 *  client throws `upstream <status>: <detail>`; the Worker returns stable codes
 *  (provider_not_configured / upstream_error) so we never leak internals. */
function friendlyError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/provider_not_configured|\b503\b/.test(m)) return 'Provider not configured — missing API key';
  if (/unauthorized|\b401\b/.test(m)) return 'Unauthorized — check APP_TOKEN';
  if (/upstream_error|\b50[02]\b/.test(m)) return 'Provider error — check the API key / model id';
  if (/failed to fetch|networkerror|econnrefused/i.test(m)) return 'Worker unreachable — is it running?';
  return 'Provider call failed';
}

/** Errors that won't recover by retrying — trip the lane offline on the FIRST
 *  occurrence rather than burning three calls. A generic `upstream_error` (which
 *  is what a wrong/missing API key surfaces as mid-stream) is NOT treated as
 *  immediately fatal, so it rides the consecutive-failure threshold instead. */
function isFatalProviderError(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /provider_not_configured|\b503\b|unauthorized|\b401\b|\b403\b|wrong_api_key|failed to fetch|networkerror|econnrefused/.test(m);
}
