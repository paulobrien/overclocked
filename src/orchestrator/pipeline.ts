/**
 * Orchestrator — runs the per-item agent graph (§5).
 *
 *        ┌─────────┐   ┌────────┐   ┌─────────┐  pass   ┌──────────┐
 *  item ─▶│ ROUTER  │─▶ │ WORKER │─▶ │ CHECKER │────────▶│ DECISION │─▶ graded
 *        └─────────┘   └────────┘   └────┬────┘         └──────────┘
 *                          ▲   retry ×1  │ fail              ▲
 *                          └─────────────┘                   │
 *                                        │ low-conf / 2× fail│
 *                                   ┌────▼─────────┐         │
 *                                   │ ESCALATION   │─────────┘
 *                                   └──────────────┘
 *
 * The pipeline depth toggle (single-agent ↔ full graph) is a great exhibition
 * beat: show the accuracy lift the checker buys, and that Cerebras still wins
 * on speed even at full depth.
 *
 * Every extra hop multiplies per-item latency, so the GPU lane drowns HARDER
 * under the same pipeline — the multi-agent design widens the gap rather than
 * just adding realism. "Cerebras runs a 4-agent pipeline per parcel and still
 * clears faster than GPU does a single pass."
 */
import type { AgentClient, CoordinationTrace, PipelineStepTrace, TaskScenario, TaskType, Verdict } from '../shared/contract';
import type { ProviderConfig } from '../agents/streaming';
import { workerAgentFromTask } from '../agents/createAgent';
import { routerAgent, checkerAgent, escalationAgent } from '../agents/roles';
import { findTaskType } from '../tasks/registry';
import { deriveVerdict } from './verdict';
import { shouldEscalate } from './policy';
import type { CheckerVerdict } from '../tasks/schemas';

/** Resolve a router-emitted task id (free text) to a real task, tolerantly.
 *  Returns undefined if the decision doesn't map to anything known. */
function resolveTask(rawId: string): TaskType | undefined {
  const id = String(rawId ?? '').trim().toLowerCase();
  if (!id) return undefined;
  return findTaskType(id) ?? findTaskType(id.replace(/[_\s]/g, '-'));
}

export type PipelineDepth = 'single' | 'full';

export interface OrchestratorConfig {
  /** single = worker only; full = router→worker→checker→escalation graph. */
  depth: PipelineDepth;
  /** Provider for real lanes (ignored by mock). */
  provider?: ProviderConfig;
  /** The agent client to run worker steps through. */
  client: AgentClient;
  /** Called as each step status changes — drives the focus card live. */
  onStep?: (step: PipelineStepTrace) => void;
  /** Called with live tokens/sec as the stream runs. */
  onToken?: (tokensPerSec: number) => void;
}

export interface PipelineOutcome {
  trace: CoordinationTrace;
  /** The final structured output handed to the grader. */
  output: unknown;
  /** Total wall-clock for the whole graph. */
  totalLatencyMs: number;
  /** Aggregate tokens across all steps. */
  totalTokens: number;
  /** Best observed tokens/sec (for the speedometer). */
  tokensPerSec: number;
}

/**
 * Run a single parcel through the agent graph.
 *
 * Returns the final output (graded elsewhere) plus a coordination trace for
 * the focus card and post-round review. Coordination stats (caught, retries,
 * escalated) are flavor + ROI — they never affect the score, so the race
 * stays clean: both lanes run the identical graph, graded identically.
 */
export async function runPipeline(
  scenario: TaskScenario,
  task: TaskType,
  cfg: OrchestratorConfig,
): Promise<PipelineOutcome> {
  const steps: PipelineStepTrace[] = [
    { id: 'route', label: 'Route', status: 'pending' },
    { id: 'work', label: 'Work', status: 'pending' },
    { id: 'check', label: 'Check', status: 'pending' },
    { id: 'decide', label: 'Decide', status: 'pending' },
  ];
  let retries = 0;
  let escalated = false;
  let caught = 0;
  const start = performance.now();
  let totalTokens = 0;
  let bestTps = 0;

  const set = (id: string, patch: Partial<PipelineStepTrace>) => {
    const s = steps.find((x) => x.id === id)!;
    Object.assign(s, patch);
    cfg.onStep?.({ ...s });
  };
  const reportTps = (tps: number) => {
    if (tps > bestTps) bestTps = tps;
    cfg.onToken?.(tps);
  };

  // Single-agent path: used when depth is 'single' OR when there is no provider
  // (mock/human lanes can't run the multi-agent graph — the router/checker/
  // escalation role agents need a real model). This keeps the depth toggle
  // honest: it only affects lanes that actually have inference behind them.
  if (cfg.depth === 'single' || !cfg.provider) {
    set('route', { status: 'done', latencyMs: 0 });
    const r = await runWorker(scenario, task, cfg, reportTps);
    totalTokens += r.tokens;
    set('check', { status: 'done', latencyMs: 0 });
    const verdict = verdictFor(task, r.output);
    set('decide', { status: 'done', latencyMs: 0 });
    return finalize(steps, r.output, { retries, escalated, caught, verdict }, start, totalTokens, bestTps);
  }

  // ── ROUTER ────────────────────────────────────────────────────────────
  // The router decides which worker specialist runs — this is the load-bearing
  // "one agent decides what another runs" coordination. Its decision may differ
  // from the scenario's nominal type; when it does, the worker follows the
  // router's call, but grading always uses the scenario's TRUE task so the
  // ground-truth comparison stays fair and the race stays clean.
  let workerTask = task;
  set('route', { status: 'running' });
  try {
    const routerRes = await routerAgent.run(scenario, cfg.provider, (tps) => reportTps(tps));
    totalTokens += routerRes.tokens;
    set('route', { status: 'done', latencyMs: Math.round(routerRes.latencyMs), tokensPerSec: Math.round(routerRes.tokensPerSec) });
    const decision = routerRes.parsed;
    if (decision?.taskType) {
      const routed = resolveTask(decision.taskType);
      if (routed && routed.id !== task.id) {
        workerTask = routed; // dispatch follows the router — coordination is real
        cfg.onStep?.({ ...steps[0], status: 'done', detail: `→ ${routed.label}` });
      }
    }
  } catch {
    set('route', { status: 'done', latencyMs: 0 });
  }

  // ── WORKER (+ checker retry loop) ────────────────────────────────────
  set('work', { status: 'running' });
  let workRes = await runWorker(scenario, workerTask, cfg, reportTps);
  totalTokens += workRes.tokens;
  set('work', { status: 'done', latencyMs: Math.round(workRes.latencyMs), tokensPerSec: Math.round(workRes.tokensPerSec) });

  // ── CHECKER ───────────────────────────────────────────────────────────
  set('check', { status: 'running' });
  let checkerNotes: string[] = [];
  let checkerPass = true;
  let checkerVerdict: CheckerVerdict | null = null;
  let attempts = 1;
  try {
    const checkerRes = await checkerAgent.run(
      { scenario, workerOutput: workRes.output },
      cfg.provider,
      (tps) => reportTps(tps),
    );
    totalTokens += checkerRes.tokens;
    const v = checkerRes.parsed;
    checkerVerdict = v ?? null;
    set('check', {
      status: v && !v.pass ? 'fail' : 'done',
      latencyMs: Math.round(checkerRes.latencyMs),
      tokensPerSec: Math.round(checkerRes.tokensPerSec),
    });
    if (v) {
      checkerPass = v.pass;
      checkerNotes = v.reasons;
      if (!checkerPass) {
        caught++;
        // One retry: bounce back to the worker.
        retries++;
        attempts = 2;
        set('work', { status: 'running' });
        workRes = await runWorker(scenario, workerTask, cfg, reportTps);
        totalTokens += workRes.tokens;
        set('work', { status: 'done', latencyMs: Math.round(workRes.latencyMs), tokensPerSec: Math.round(workRes.tokensPerSec) });
      }
    }
  } catch {
    set('check', { status: 'done', latencyMs: 0 });
  }

  // ── ESCALATION ───────────────────────────────────────────────────────
  // Via the shared policy: only real exceptions (Verifier bounced it, low
  // confidence, or a known-adversarial case) — NOT every difficulty-3 item — so
  // the escalation rate reflects genuine second-looks, not task volume.
  if (shouldEscalate({ scenario, task, checker: checkerVerdict, attempts })) {
    set('decide', { status: 'running' });
    escalated = true;
    try {
      const escRes = await escalationAgent.run(
        { scenario, workerOutput: workRes.output, checkerNotes },
        cfg.provider,
        (tps) => reportTps(tps),
      );
      totalTokens += escRes.tokens;
      const d = escRes.parsed;
      if (d) {
        // Escalation can override the verdict (e.g. refuse a suspicious item).
        workRes.output = { ...((workRes.output as object) ?? {}), escalationDecision: d.decision };
      }
    } catch {
      // fall through — keep the worker's output
    }
  }

  const verdict = verdictFor(task, workRes.output);
  set('decide', { status: 'done', latencyMs: 0 });
  return finalize(steps, workRes.output, { retries, escalated, caught, verdict }, start, totalTokens, bestTps);
}

/** Run the worker step (the only step that must always succeed). */
async function runWorker(
  scenario: TaskScenario,
  task: TaskType,
  cfg: OrchestratorConfig,
  reportTps: (tps: number) => void,
) {
  // Mock/human clients run through client.run; real clients go via the agent.
  if (cfg.provider) {
    const agent = workerAgentFromTask(task);
    const r = await agent.run(scenario, cfg.provider, (tps) => reportTps(tps));
    reportTps(r.tokensPerSec); // settle the needle on the real overall rate
    return { output: r.parsed ?? r.output, tokens: r.tokens, latencyMs: r.latencyMs, tokensPerSec: r.tokensPerSec };
  }
  // Mock / human path
  const r = await cfg.client.run(scenario, task);
  reportTps(r.tokensPerSec);
  return { output: r.output, tokens: r.tokens, latencyMs: r.latencyMs, tokensPerSec: r.tokensPerSec };
}

/** The displayed verdict — derived from the task + the (possibly
 *  escalation-overridden) output fields, via the SHARED `deriveVerdict` that
 *  also produces the answer key, so a correct output always reaches its
 *  `correctOutcome.verdict`. Note: a clean escalation (the specialist reviewed
 *  but didn't hold/refuse) must NOT blanket-force 'hold' — that previously
 *  masked correct accepts/reroutes on every high-stakes item. The specialist's
 *  decision rides on `output.escalationDecision`, which `deriveVerdict` reads. */
function verdictFor(task: TaskType, output: unknown): Verdict {
  return deriveVerdict(task.id, output as Record<string, unknown>);
}

function finalize(
  steps: PipelineStepTrace[],
  output: unknown,
  ctx: { retries: number; escalated: boolean; caught: number; verdict: Verdict },
  start: number,
  totalTokens: number,
  bestTps: number,
): PipelineOutcome {
  return {
    output,
    totalLatencyMs: performance.now() - start,
    totalTokens,
    tokensPerSec: bestTps,
    trace: {
      steps,
      retries: ctx.retries,
      escalated: ctx.escalated,
      caught: ctx.caught,
      verdict: ctx.verdict,
      finalOutput: output,
    },
  };
}
