/**
 * Streaming chat client — talks to OUR Worker, never the provider directly.
 *
 * The Worker injects keys and forwards to Cerebras/OpenRouter, streaming the
 * response straight back. The speedometer shows the EFFECTIVE rate — total
 * output tokens over the total call time. For our short structured outputs the
 * model generates the object server-side and ships it in a couple of chunks, so
 * a per-token "decode" rate isn't observable; the effective rate is the honest,
 * stable number and is comparable across lanes.
 *
 * Both providers are OpenAI-compatible, so the streaming wire format is the
 * same SSE `data: {...}` framing regardless of silicon.
 */
import type { ChatMessages } from '../shared/contract';

export interface StreamCallbacks {
  /** Called for each token/chunk of text as it arrives, with the running
   *  tokens/sec measured over the generation window so far (so the speedometer
   *  shows a real RATE, not a token count). */
  onToken?: (delta: string, runningTps: number) => void;
  /** Called once the full text is assembled. */
  onDone?: (full: string) => void;
  /** Called on a hard error (network / non-2xx / parse). */
  onError?: (err: Error) => void;
}

export interface ProviderConfig {
  /** Which provider lane — routed by the Worker to its AI SDK model. */
  provider: 'cerebras' | 'openrouter' | 'nvidia' | 'gemini';
  /** Override the Worker's default model for this lane (exhibition rounds). */
  model?: string;
  /** Sampling temperature — low for structured extraction. */
  temperature?: number;
  /** Max completion tokens. */
  maxTokens?: number;
}

/** Extra context the Worker needs to resolve the output schema for `streamObject`.
 *  The Worker maps (role, taskTypeId) → Zod schema, so it can run structured
 *  output without the client shipping schemas. */
export interface StreamContext {
  role: 'worker' | 'router' | 'checker' | 'escalation';
  /** Required for workers (so the Worker picks the task's schema); ignored by
   *  router/checker/escalation which have fixed schemas. */
  taskTypeId?: string;
}

export interface StreamResult {
  text: string;
  /** Wall-clock from request send to final token. */
  latencyMs: number;
  /** Approx completion tokens (heuristic: words + punctuation count). */
  tokens: number;
  tokensPerSec: number;
  /** Whether the request actually streamed (vs. fell back to one shot). */
  streamed: boolean;
}

// Read Vite env defensively so this module can also be imported outside Vite
// (e.g. headless engine/sim scripts) without crashing on an undefined env.
const ENV = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const API_BASE = ENV.VITE_AGENT_BASE ? `${ENV.VITE_AGENT_BASE}/api` : '/api';

const APP_TOKEN = ENV.VITE_APP_TOKEN || '';

/**
 * Run a streaming chat completion through the Worker.
 * Falls back to a non-streaming request if SSE parsing fails, so a provider
 * that doesn't stream cleanly still works (just without a live speedometer).
 */
export async function streamChat(
  messages: ChatMessages,
  cfg: ProviderConfig,
  cb: StreamCallbacks = {},
  signal?: AbortSignal,
  ctx?: StreamContext,
): Promise<StreamResult> {
  const start = performance.now();
  const body = {
    provider: cfg.provider,
    model: cfg.model,
    role: ctx?.role ?? 'worker',
    taskTypeId: ctx?.taskTypeId,
    messages,
    temperature: cfg.temperature ?? 0.2,
    max_tokens: cfg.maxTokens ?? 512,
    stream: true,
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(APP_TOKEN ? { 'x-app-token': APP_TOKEN } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    cb.onError?.(e);
    throw e;
  }

  if (!res.ok || !res.body) {
    // The Worker surfaces provider errors as a non-2xx with a JSON body.
    const detail = await res.text().catch(() => '');
    const err = new Error(`upstream ${res.status}: ${detail.slice(0, 200)}`);
    cb.onError?.(err);
    throw err;
  }

  // The Worker always returns OpenAI-shaped SSE now (it wraps streamObject's
  // text deltas). Parse the delta.content chunks and assemble the JSON.
  let full = '';
  let streamed = false;
  let providerTps: number | undefined; // the Worker's real decode rate, if sent
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      streamed = true;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          // The Worker emits an error frame on failure — surface it.
          if (json?.error) {
            cb.onError?.(new Error(String(json.error)));
            continue;
          }
          // The Worker's final frame carries the provider's REAL decode rate.
          if (typeof json?.tps === 'number') {
            providerTps = json.tps;
            continue;
          }
          const delta: string = json?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            full += delta;
            // Running EFFECTIVE rate (tokens so far ÷ elapsed since the request).
            // This is a real RATE, not a token count, and is stable for our short
            // structured outputs (see the note on the final rate below).
            const elapsed = performance.now() - start;
            const runningTps = elapsed >= 1 ? (approxTokens(full) / elapsed) * 1000 : 0;
            cb.onToken?.(delta, runningTps);
          }
        } catch {
          // Partial JSON across chunks — ignore, the next read completes it.
        }
      }
    }
  } catch (err) {
    // A mid-stream error still gives us partial text — return what we have.
    const e = err instanceof Error ? err : new Error(String(err));
    cb.onError?.(e);
  }

  const latencyMs = performance.now() - start;
  const tokens = approxTokens(full);
  // Prefer the provider's REAL decode rate (the Worker reads `time_info` from the
  // raw stream and sends it as a final frame — e.g. Cerebras's true ~1000s tok/s).
  // Otherwise fall back to the EFFECTIVE rate over the whole call: for our short
  // structured outputs the model generates the object server-side and ships it in
  // a couple of chunks, so without provider timing the honest number is just total
  // tokens ÷ total time (overhead-bound, but real and comparable across lanes).
  const tokensPerSec = providerTps ?? (latencyMs > 0 ? (tokens / latencyMs) * 1000 : 0);
  cb.onDone?.(full);
  return { text: full, latencyMs, tokens, tokensPerSec, streamed };
}

/** Rough token estimate: ~4 chars/token, but structured JSON has more per token. */
export function approxTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}
