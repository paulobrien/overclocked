/**
 * OVERCLOCKED — the shared contract.
 *
 * §4 of the design spec. The single rule that makes 20 heterogeneous tasks
 * gradeable and both lanes comparable:
 *
 *   every task returns a small structured object validated by Zod and checked
 *   by a deterministic grader against known ground truth.
 *
 * Never grade open-ended prose — if a task should also produce a nice reply,
 * grade the structured side-channel, not the prose. These types are framework-
 * free and live in `src/shared` so BOTH the app and the Worker can import them
 * without pulling in React or any runtime.
 */
import type { z } from 'zod';

export type Modality = 'vision' | 'document' | 'text' | 'video';

// --- Chat message shapes (OpenAI-compatible, multimodal-aware) -------------

export interface TextPart {
  type: 'text';
  text: string;
}
export interface ImagePart {
  type: 'image_url';
  image_url: { url: string }; // asset path (resolved to URL) or data URL
}
export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
}
export type ChatMessages = ChatMessage[];

// --- Ground truth ----------------------------------------------------------
// Free-form per task type (a parsed address, a damage verdict, etc.) but it
// must be a plain JSON object so scenarios serialize to JSON and the grader
// can compare field-by-field.
export type GroundTruth = Record<string, unknown>;

// --- Grading ---------------------------------------------------------------

export interface GradeResult {
  /** Did the final output match ground truth closely enough to count? */
  correct: boolean;
  /** 0..1 — multi-field tasks give partial credit per correct field. */
  partial: number;
  /** partial × difficulty × BASE_POINTS — the points awarded to the score. */
  scoreDelta: number;
  /** Human-readable readout for the focus card and post-round trace. */
  detail: string;
  /** Which fields the agent got right/wrong — for the focus card detail. */
  fields?: { key: string; label: string; ok: boolean; expected?: string; got?: string }[];
  /** The verdict the agent SHOULD have stamped (from the scenario's answer key). */
  correctVerdict?: Verdict;
  /** One-line summary of the correct disposition (the answer-key readout). */
  correctSummary?: string;
}

// --- A single scenario on the conveyor ------------------------------------

export interface TaskScenario {
  id: string;
  /** For cloned scenarios (one per lane): the original pool id they share, so
   *  the fairness trace can confirm all lanes got the same task. */
  baseId?: string;
  taskTypeId: string;
  /** Multimodal input the worker agent consumes. */
  input: {
    text?: string;
    /** Asset path under /data/assets or a full/data URL. */
    imageUrl?: string;
    documents?: string[];
    /** Ordered still frames sampled from a clip (the `video` modality). The
     *  model receives these as a labelled image sequence — Cerebras's Gemma 4
     *  ingests text + images only, so a clip is sampled to frames and EVERY lane
     *  gets the same frames (the fair, provider-agnostic path to video). */
    frames?: string[];
    /** Optional composited clip (mp4) of the same frames — the UI plays this as
     *  the "line camera" source; the model still consumes `frames`. */
    videoUrl?: string;
  };
  /** The authored, locked answer — the grader compares the agent's output to this. */
  groundTruth: GroundTruth;
  difficulty: 1 | 2 | 3;
  /** The CORRECT outcome for this case — what the agent *should* decide and
   *  whether the case passes or fails. First-class metadata, not inferred from
   *  the agent's output. The verdict is the operational decision (the stamp);
   *  pass/fail is whether the final structured output matched ground truth. */
  correctOutcome: CorrectOutcome;
  /** True for the highlight-reel adversarial cases (tamper, hazmat mislabel...). */
  adversarial?: boolean;
  /** Optional one-line description for the lobby explorer. */
  blurb?: string;
}

/** The declared correct outcome for a scenario. This is the "answer key" — it
 *  says what should happen, independent of what any agent actually did. */
export interface CorrectOutcome {
  /** The operational verdict the agent SHOULD stamp for this parcel. */
  verdict: Verdict;
  /** Whether clearing this case is a pass (item handled correctly) or a fail
   *  (the exception couldn't be resolved, or resolving it is itself the failure
   *  — e.g. an unscreenable prohibited item). Drives the ROI 'parcels resolved'
   *  count and the post-round accuracy stat. */
  pass: boolean;
  /** One-line human summary of the correct disposition, for the trace / focus
   *  card / judging readout. e.g. "Crushed parcel — refuse, severity 4". */
  summary: string;
}

// --- What an agent call produced ------------------------------------------

export interface AgentResult {
  /** Structured, pre-validation answer. */
  output: unknown;
  /** Raw text the model emitted (for the trace / debugging). */
  raw: string;
  /** Approx tokens consumed (prompt + completion). */
  tokens: number;
  /** Wall-clock latency of this single call. */
  latencyMs: number;
  /** tokens / latencyMs * 1000 — the live speedometer feeds off this. */
  tokensPerSec: number;
}

// --- The task definition (what the registry holds) ------------------------

export interface TaskType {
  id: string; // e.g. 'damage-assessment'
  label: string; // 'Damage Assessment'
  /** emoji/short glyph used as the task chip icon in the focus card. */
  icon: string;
  modality: Modality;
  /** Drives points and how much the speed gap shows. */
  difficulty: 1 | 2 | 3;
  /** Structured answer shape — THE single source of truth for this task. */
  outputSchema: z.ZodType<unknown>;
  /** Build the multimodal-aware prompt from a scenario. Async because vision
   *  images are fetched + base64-encoded before sending (a relative asset path
   *  can't be consumed by the model directly). */
  buildPrompt(s: TaskScenario): Promise<ChatMessages>;
  /** Compare the (parsed) agent output to ground truth. */
  grade(output: unknown, truth: GroundTruth): GradeResult;
  /** Which focus-card rows to render and in what order, derived from the schema. */
  focusFields?: FocusFieldSpec[];
  /** Controls a human player answers in the "I Wanna Play" overlay. Declared
   *  explicitly per task (not introspected from Zod internals) so the overlay
   *  is robust across Zod versions and stays authoritative. */
  humanControls?: HumanControl[];
}

export interface FocusFieldSpec {
  /** key into the parsed output object */
  key: string;
  label: string;
}

/** A single human-answerable field in the click-to-classify overlay. */
export interface HumanControl {
  /** key into the parsed output object — must match a focusField key. */
  key: string;
  label: string;
  kind: 'enum' | 'boolean' | 'number' | 'text';
  /** For enum controls: the pickable options (buttons). */
  options?: string[];
}

// --- The unified agent interface ------------------------------------------
// Cerebras, OpenRouter (GPU), and the Human lane all implement this. That
// symmetry is what guarantees a fair race: identical interface, identical
// pipeline, identical grader — the only variable is the silicon.
export interface AgentClient {
  name: string;
  run(scenario: TaskScenario, task: TaskType): Promise<AgentResult>;
}

// --- Pipeline + orchestration shapes --------------------------------------

export type PipelineStepId = 'route' | 'work' | 'check' | 'decide';

export interface PipelineStepTrace {
  id: PipelineStepId;
  label: string;
  status: 'pending' | 'running' | 'done' | 'fail';
  /** tokens/sec observed during this step, for the live readout. */
  tokensPerSec?: number;
  latencyMs?: number;
  /** Optional sub-detail, e.g. the router's dispatch decision. */
  detail?: string;
}

export type Verdict = 'accept' | 'reroute' | 'hold' | 'refuse';

export interface CoordinationTrace {
  steps: PipelineStepTrace[];
  retries: number;
  escalated: boolean;
  /** Checker-detected errors (misroutes caught, etc.) — ROI flavor, not score. */
  caught: number;
  verdict: Verdict;
  /** Final structured output the grader scored. */
  finalOutput: unknown;
}

// --- Verdict styling (shared between focus card and banner) ---------------

export const VERDICT_META: Record<Verdict, { label: string; className: string }> = {
  accept: { label: 'Accept', className: 'accept' },
  reroute: { label: 'Reroute', className: 'reroute' },
  hold: { label: 'Hold', className: 'hold' },
  refuse: { label: 'Refuse', className: 'refuse' },
};

// --- Scoring constant ------------------------------------------------------
// score = Σ (partial × difficulty × BASE_POINTS) over cleared items.
// A clean accept on a difficulty-3 item = 1 × 3 × 100 = 300 pts.
export const BASE_POINTS = 100;
