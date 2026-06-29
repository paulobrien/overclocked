/**
 * createAgent(config) — the one factory every agent is built from (§5).
 *
 * Most of buildMessages, parse, and the streaming call are identical across
 * every agent — only the schema and system prompt differ. So this factory
 * supplies the shared plumbing; a new agent (of any role) is a ~15-line config.
 *
 * "The test that proves the blueprint is right: adding task #21 OR a new agent
 *  role should mean writing one config (plus a grader for workers) — nothing
 *  else. If it requires touching the engine, the blueprint has leaked."
 */
import { z } from 'zod';
import type { AgentResult, ChatMessages, Modality, TaskScenario, TaskType } from '../shared/contract';
import { type ProviderConfig, streamChat } from './streaming';
import { schemaToInstruction } from '../tasks/prompt';

export type AgentRole = 'router' | 'worker' | 'checker' | 'escalation' | 'orchestrator';

export interface AgentConfig<TInput, TOutput> {
  id: string;
  role: AgentRole;
  label: string;
  modality?: Modality;
  /** For workers: the task type id, so the Worker can resolve the output schema.
   *  Role agents (router/checker/escalation) don't need this — their schema is
   *  fixed by role. */
  taskTypeId?: string;
  /** The single source of truth for this agent. */
  outputSchema: z.ZodType<TOutput>;
  systemPrompt: string;
  /** Assemble the multimodal user message from input. May be async (vision
   *  images are base64-encoded before sending). */
  buildMessages(input: TInput): ChatMessages | Promise<ChatMessages>;
}

export interface Agent<TInput, TOutput> extends AgentConfig<TInput, TOutput> {
  /** Run via the streaming client and parse into the validated schema.
   *  `onToken` receives the live tokens/sec RATE (not a token count). */
  run(input: TInput, provider: ProviderConfig, onToken?: (tps: number) => void): Promise<AgentResult & { parsed: TOutput | null }>;
}

/** Map the agent's role to the Worker's role union (used for schema lookup). */
function workerRole(role: AgentRole): 'worker' | 'router' | 'checker' | 'escalation' {
  if (role === 'router' || role === 'checker' || role === 'escalation') return role;
  return 'worker'; // worker + orchestrator both use the worker schema path
}

/**
 * Build an agent from a config. The run() implementation is identical for every
 * role: stream the completion, parse the JSON against the schema, record real
 * tokens/sec. parse() is tolerant — it strips markdown fences and extracts the
 * JSON object before validating.
 */
export function createAgent<TInput, TOutput>(config: AgentConfig<TInput, TOutput>): Agent<TInput, TOutput> {
  return {
    ...config,
    async run(input, provider, onToken) {
      const built = await config.buildMessages(input);
      const messages: ChatMessages = [
        { role: 'system', content: config.systemPrompt },
        ...built,
      ];
      const { text, latencyMs, tokens, tokensPerSec } = await streamChat(
        messages,
        provider,
        // Deliberately NOT forwarding the per-chunk running rate: for our short
        // structured outputs the "effective" streaming rate is overhead-bound
        // noise (the object ships in 1–2 chunks) and, reported many times, it
        // drowns the one real settle. We report the SETTLED rate once below.
        {},
        undefined,
        { role: workerRole(config.role), taskTypeId: config.taskTypeId },
      );
      // Settle the speedometer on the REAL decode rate: for Cerebras this is the
      // provider's time_info rate (~1000s tok/s), not the network-bound effective
      // rate — so the live needle reflects the true silicon advantage, not a
      // number dragged down to ~100 by streaming overhead.
      onToken?.(tokensPerSec);
      const parsed = parseOutput<TOutput>(text, config.outputSchema);
      return {
        output: parsed ?? undefined,
        parsed,
        raw: text,
        tokens,
        latencyMs,
        tokensPerSec,
      };
    },
  };
}

/** Tolerant JSON extraction + Zod validation. Strips fences, finds the {...}. */
export function parseOutput<T>(raw: string, schema: z.ZodType<T>): T | null {
  if (!raw) return null;
  const cleaned = stripFences(raw).trim();
  const candidate = extractJsonObject(cleaned);
  if (candidate == null) return null;
  const result = schema.safeParse(candidate);
  if (result.success) return result.data;
  // Schema-aware coercion: unwrap single-element arrays where a scalar is
  // expected (some OpenAI-compatible backends emit enums as ["jam"] not "jam"),
  // and turn "true"/numeric strings into real booleans/numbers.
  const shaped = coerceToSchema(candidate, schema);
  const shapedResult = schema.safeParse(shaped);
  if (shapedResult.success) return shapedResult.data;
  // Last-ditch: coerce obvious number/bool strings.
  return schema.safeParse(coerce(candidate)).success ? (coerce(candidate) as T) : null;
}

/**
 * Coerce a parsed candidate toward the schema's expected shapes before
 * validation. Schema-AWARE, so it fixes the right things without flattening
 * genuine array fields (e.g. the checker's `reasons: string[]`):
 *   • a scalar field that arrived as a 1-element array is unwrapped (["jam"] →
 *     "jam") — Cerebras's Gemma wraps enum values this way;
 *   • "true"/"false" → boolean and numeric strings → number where the schema
 *     expects those types.
 * Without this, a perfectly-correct answer wrapped as ["jam"] fails validation
 * and the parse returns null — losing the model's actual (right) output.
 */
function coerceToSchema(value: unknown, schema: z.ZodType<unknown>): unknown {
  let s = schema as z.ZodTypeAny;
  while (s instanceof z.ZodOptional || s instanceof z.ZodNullable) s = s.unwrap();

  // Scalar expected but a 1-element array arrived → unwrap and recurse.
  if (!(s instanceof z.ZodArray) && Array.isArray(value) && value.length === 1) {
    return coerceToSchema(value[0], s);
  }
  if (s instanceof z.ZodObject) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const shape = s.shape as Record<string, z.ZodTypeAny>;
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [k, fieldSchema] of Object.entries(shape)) {
      if (k in out) out[k] = coerceToSchema(out[k], fieldSchema);
    }
    return out;
  }
  if (s instanceof z.ZodArray) {
    if (!Array.isArray(value)) return value;
    const el = (s as z.ZodArray<z.ZodTypeAny>).element;
    return value.map((v) => coerceToSchema(v, el));
  }
  if (s instanceof z.ZodNumber && typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (s instanceof z.ZodBoolean && typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return value;
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObject(s: string): unknown {
  // Try the whole thing first.
  try {
    return JSON.parse(s);
  } catch {
    // fall through
  }
  // Otherwise grab the first balanced {...} block.
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

function coerce(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(coerce);
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string') {
        if (v === 'true') out[k] = true;
        else if (v === 'false') out[k] = false;
        else if (/^-?\d+(\.\d+)?$/.test(v) && v.length < 12) out[k] = Number(v);
        else out[k] = v;
      } else {
        out[k] = coerce(v);
      }
    }
    return out;
  }
  return obj;
}

/** Convenience: build a worker-style agent directly from a TaskType. */
export function workerAgentFromTask(task: TaskType): Agent<TaskScenario, unknown> {
  return createAgent<TaskScenario, unknown>({
    id: `worker-${task.id}`,
    role: 'worker',
    taskTypeId: task.id,
    label: task.label,
    modality: task.modality,
    outputSchema: task.outputSchema,
    systemPrompt: workerSystemPrompt(task),
    buildMessages: async (s) => (await task.buildPrompt(s)).slice(1), // drop duplicate system msg
  });
}

function workerSystemPrompt(task: TaskType): string {
  return [
    `You are a specialist ${task.label} agent on a warehouse sortation line.`,
    `Modality: ${task.modality}. Difficulty: ${task.difficulty}.`,
    schemaToInstruction(task.outputSchema),
    `Return ONLY the JSON object. No prose, no markdown.`,
  ].join('\n');
}
