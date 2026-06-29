/**
 * OVERCLOCKED — Cloudflare Worker (agent backend), AI SDK host.
 *
 * The browser never holds API keys. Every model call goes through this Worker,
 * which:
 *   1. resolves the provider → a Vercel AI SDK model (Cerebras / OpenRouter via
 *      @ai-sdk/openai-compatible, Gemini via @ai-sdk/google),
 *   2. looks up the Zod output schema for the task/role,
 *   3. runs `streamObject` so the model emits SCHEMA-VALIDATED JSON while still
 *      streaming token-by-token — the live tokens/sec speedometer is preserved,
 *   4. re-wraps the JSON text deltas as OpenAI-shaped SSE so the existing client
 *      streaming code in src/agents/streaming.ts works UNCHANGED.
 *
 * One symmetric code path for all three providers = a fair race; the only
 * variable is the silicon/model. Structured output replaces the brittle
 * prompt-only parsing with real schema validation — a genuine accuracy lift.
 */
import { streamObject, type LanguageModel, type ModelMessage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { SCHEMA_BY_TASK, RouterSchema, CheckerSchema, EscalationSchema } from '../src/tasks/schemas';
import type { ZodType } from 'zod';

export type ProviderId = 'cerebras' | 'openrouter' | 'nvidia' | 'gemini';
export type AgentRole = 'worker' | 'router' | 'checker' | 'escalation';

/**
 * Validate the inbound messages before they reach the model. The client only
 * ever sends system + user messages; rejecting everything else (assistant/tool)
 * stops a caller from injecting prior assistant agreement or tool calls that
 * could steer the model. Image URLs are constrained to data: URLs or our own
 * asset host — this closes the SSRF/billing vector where the provider would
 * server-side fetch an arbitrary attacker URL, and blocks cloud-metadata reads.
 */
const ASSET_HOSTS = ['localhost', '127.0.0.1', 'overclocked.app', 'overclocked.pages.dev'];
const TextPartSchema = z.object({ type: z.literal('text'), text: z.string() });
const ImagePartSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string().refine((u) => {
      if (u.startsWith('data:')) return true;
      if (/^https?:\/\//i.test(u)) {
        try {
          const h = new URL(u).hostname;
          return ASSET_HOSTS.some((a) => h === a || h.endsWith(`.${a}`));
        } catch {
          return false;
        }
      }
      return false;
    }, 'image url must be a data URL or served from an allowed asset host'),
  }),
});
const MessageSchema = z.object({
  role: z.enum(['system', 'user']),
  content: z.union([z.string(), z.array(z.union([TextPartSchema, ImagePartSchema]))]),
});
const MessagesSchema = z.array(MessageSchema).min(1).max(32);

type InboundMessage = z.infer<typeof MessageSchema>;

/** Pull the plain text out of a string-or-parts content (images dropped). */
function contentToText(content: InboundMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

/**
 * Translate the inbound OpenAI-shaped messages into the AI SDK's prompt form.
 * Two things the SDK requires that the wire format doesn't give us:
 *   1. System prompts must be passed via the `system` option, NOT as a
 *      `role:'system'` entry inside `messages` (the SDK throws
 *      `AI_InvalidPromptError` otherwise).
 *   2. Image parts must be `{ type:'image', image }`, NOT the OpenAI
 *      `{ type:'image_url', image_url:{url} }` shape — data: URLs pass through
 *      as strings, http(s) URLs become `URL` instances.
 * Exported so the unit test can assert the transform offline (no model).
 */
export function toModelMessages(messages: InboundMessage[]): { system?: string; messages: ModelMessage[] } {
  const systemParts: string[] = [];
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(contentToText(m.content));
      continue;
    }
    if (typeof m.content === 'string') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    out.push({
      role: 'user',
      content: m.content.map((part) =>
        part.type === 'text'
          ? { type: 'text' as const, text: part.text }
          : {
              type: 'image' as const,
              image: part.image_url.url.startsWith('data:') ? part.image_url.url : new URL(part.image_url.url),
            },
      ),
    });
  }
  return { system: systemParts.length ? systemParts.join('\n\n') : undefined, messages: out };
}

export interface Env {
  // Cerebras (OpenAI-compatible, wafer-scale)
  CEREBRAS_API_KEY: string;
  CEREBRAS_BASE_URL: string;
  CEREBRAS_MODEL: string;
  // OpenRouter (OpenAI-compatible, GPU-hosted challenger)
  OPENROUTER_API_KEY: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_MODEL: string;
  // NVIDIA NIM (OpenAI-compatible, GPU-hosted) — alternative challenger
  NVIDIA_API_KEY: string;
  NVIDIA_BASE_URL: string;
  NVIDIA_MODEL: string;
  // Gemini (the "bottom production line" — Gemini 3.1 Flash Lite)
  GEMINI_API_KEY: string;
  GEMINI_BASE_URL: string;
  GEMINI_MODEL: string;
  // Shared
  APP_TOKEN: string;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/** Model ids that are NOT real served ids — an empty id, or an old/guessed one —
 *  flagged by /api/config so the lobby can warn before a live race. The shipped
 *  wrangler.toml defaults (`gemma-4-31b`, `google/gemma-4-31b-it`,
 *  `gemini-3.1-flash-lite`) are the real hackathon ids and are intentionally NOT
 *  listed. Keep in sync with wrangler.toml. */
const PLACEHOLDER_MODELS = new Set(['', 'google/gemma-4-31b', 'gemma-3-27b', 'google/gemma-3-27b-it']);
function isPlaceholderModel(model: string): boolean {
  return PLACEHOLDER_MODELS.has((model ?? '').trim());
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, time: Date.now() });
    }

    if (url.pathname === '/api/config') {
      // Tells the lobby which providers are wired — keys NEVER included. Also
      // flags model ids still left at a known placeholder, so a forgotten
      // wrangler.toml edit surfaces before the race rather than as a runtime error.
      return json({
        cerebras: { baseUrl: env.CEREBRAS_BASE_URL, model: env.CEREBRAS_MODEL, ready: !!env.CEREBRAS_API_KEY, placeholder: isPlaceholderModel(env.CEREBRAS_MODEL) },
        openrouter: { baseUrl: env.OPENROUTER_BASE_URL, model: env.OPENROUTER_MODEL, ready: !!env.OPENROUTER_API_KEY, placeholder: isPlaceholderModel(env.OPENROUTER_MODEL) },
        nvidia: { baseUrl: env.NVIDIA_BASE_URL, model: env.NVIDIA_MODEL, ready: !!env.NVIDIA_API_KEY, placeholder: isPlaceholderModel(env.NVIDIA_MODEL) },
        gemini: { baseUrl: env.GEMINI_BASE_URL, model: env.GEMINI_MODEL, ready: !!env.GEMINI_API_KEY, placeholder: isPlaceholderModel(env.GEMINI_MODEL) },
      });
    }

    // POST /api/chat — run one agent step via streamObject and re-emit as SSE.
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      return handleChat(req, env);
    }

    return json({ error: 'not found', path: url.pathname }, 404);
  },
} satisfies ExportedHandler<Env>;

async function handleChat(req: Request, env: Env): Promise<Response> {
  if (env.APP_TOKEN) {
    const sent = req.headers.get('x-app-token');
    if (sent !== env.APP_TOKEN) return json({ error: 'unauthorized' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const provider = body?.provider as ProviderId;
  if (provider !== 'cerebras' && provider !== 'openrouter' && provider !== 'nvidia' && provider !== 'gemini') {
    return json({ error: "provider must be 'cerebras' | 'openrouter' | 'nvidia' | 'gemini'" }, 400);
  }
  const role: AgentRole = body?.role ?? 'worker';
  if (role !== 'worker' && role !== 'router' && role !== 'checker' && role !== 'escalation') {
    return json({ error: "role must be 'worker' | 'router' | 'checker' | 'escalation'" }, 400);
  }

  // Resolve the output schema for this step. Workers key off the task id;
  // router/checker/escalation have fixed schemas.
  const schema = resolveSchema(role, body?.taskTypeId);
  if (!schema) {
    return json({ error: `no schema for ${role}${role === 'worker' ? ` task ${body?.taskTypeId}` : ''}` }, 400);
  }

  // Validate the message shape BEFORE touching credentials or the model. Bad
  // input must be rejected regardless of key state (M4: unvalidated messages
  // were an injection/SSRF vector — a caller could send arbitrary roles or an
  // http image_url the provider would fetch server-side).
  const parsed = MessagesSchema.safeParse(body?.messages);
  if (!parsed.success) {
    return json({ error: 'invalid_messages', detail: parsed.error.issues[0]?.message }, 400);
  }
  const messages = parsed.data;

  const timing: CallTiming = {};
  let model: LanguageModel;
  try {
    model = buildModel(env, provider, body?.model, timing);
  } catch {
    // Don't leak provider internals — return a stable, generic code. The cause
    // is always a missing key, which the /api/config readiness flags surface.
    return json({ error: 'provider_not_configured', provider }, 503);
  }

  // Clamp temperature to a sane model range.
  const rawTemp = typeof body?.temperature === 'number' ? body.temperature : 0.2;
  const temperature = Math.max(0, Math.min(2, rawTemp));

  // Honour the client's per-lane token budget (default 512), clamped to a sane
  // range so a single completion can't run uncapped.
  const rawMax = typeof body?.max_tokens === 'number' ? body.max_tokens : 512;
  const maxOutputTokens = Math.max(1, Math.min(8192, Math.floor(rawMax)));

  // Split the system prompt out and convert image parts to the AI SDK shape —
  // without this every live call fails prompt standardization (system-in-messages
  // and OpenAI image_url parts are both rejected by the SDK).
  const { system, messages: modelMessages } = toModelMessages(messages);
  if (modelMessages.length === 0) {
    // Only system messages were supplied — the SDK needs at least one user turn.
    // Report it as a 400 rather than letting streamObject throw a generic 502.
    return json({ error: 'invalid_messages', detail: 'at least one non-system message is required' }, 400);
  }

  try {
    const result = streamObject({
      model,
      schema,
      system,
      messages: modelMessages,
      temperature,
      maxOutputTokens,
      // Standardization/provider errors surface here (the textStream completes
      // silently rather than throwing); log server-side for diagnosis.
      onError: (e) => console.error('[chat] streamObject error:', e),
    });

    // Re-wrap the JSON text deltas as OpenAI SSE so the client code is unchanged.
    // After the stream, compute the REAL decode rate from the provider's token
    // usage and reported completion time (captured by the tee'd fetch).
    const stream = wrapStreamAsSse(result.textStream, async () => {
      const usage = (await result.usage.catch(() => undefined)) as { completionTokens?: number; outputTokens?: number } | undefined;
      const tokens = usage?.completionTokens ?? usage?.outputTokens;
      const completionTime = await (timing.completionTime ?? Promise.resolve(undefined));
      return tokens && completionTime && completionTime > 0 ? tokens / completionTime : undefined;
    });

    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', ...corsHeaders() },
    });
  } catch (err) {
    // Log full detail server-side only; never echo provider internals (which can
    // embed the request URL / echoed auth) back to the browser (H1).
    console.error('[chat] streamObject failed:', err);
    return json({ error: 'upstream_error' }, 502);
  }
}

/** Map a (role, taskTypeId) to the Zod schema the model must conform to. */
export function resolveSchema(role: AgentRole, taskTypeId?: string): ZodType | undefined {
  switch (role) {
    case 'worker':
      return taskTypeId ? SCHEMA_BY_TASK[taskTypeId] : undefined;
    case 'router':
      return RouterSchema;
    case 'checker':
      return CheckerSchema;
    case 'escalation':
      return EscalationSchema;
  }
}

/** Carries the provider's reported decode time out of the raw stream — the AI
 *  SDK drops it, so we tee the response and read it ourselves. */
export interface CallTiming {
  /** Provider's `time_info.completion_time` in SECONDS (e.g. Cerebras), or undefined. */
  completionTime?: Promise<number | undefined>;
}

/** A `fetch` wrapper that tees the streaming response and pulls the provider's
 *  `completion_time` (seconds) out of the raw SSE. This lets us report a REAL
 *  decode tokens/sec (tokens ÷ completion_time) instead of an overhead-bound
 *  effective rate — Cerebras returns `time_info`, so the headline lane shows its
 *  true ~1000s tok/s. Providers without the field simply yield undefined. */
function timingFetch(timing: CallTiming): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const res = await fetch(input, init);
    if (!res.body) return res;
    const [forSdk, forParse] = res.body.tee();
    timing.completionTime = (async () => {
      try {
        const reader = forParse.getReader();
        const dec = new TextDecoder();
        let tail = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // time_info is in the final chunk; keep only the tail to bound memory.
          tail = (tail + dec.decode(value, { stream: true })).slice(-8000);
        }
        const m = [...tail.matchAll(/"completion_time"\s*:\s*([0-9.eE+-]+)/g)];
        return m.length ? parseFloat(m[m.length - 1][1]) : undefined;
      } catch {
        return undefined;
      }
    })();
    return new Response(forSdk, { status: res.status, statusText: res.statusText, headers: res.headers });
  }) as typeof fetch;
}

/** Build the AI SDK model for a provider. Exported for testing. When `timing` is
 *  passed, OpenAI-compatible lanes capture the provider's real decode time. */
export function buildModel(env: Env, provider: ProviderId, modelOverride?: string, timing?: CallTiming): LanguageModel {
  const fetchImpl = timing ? timingFetch(timing) : undefined;
  switch (provider) {
    case 'cerebras': {
      if (!env.CEREBRAS_API_KEY) throw new Error('CEREBRAS_API_KEY not set');
      const p = createOpenAICompatible({
        name: 'cerebras',
        baseURL: env.CEREBRAS_BASE_URL,
        apiKey: env.CEREBRAS_API_KEY,
        fetch: fetchImpl,
      });
      return p(modelOverride || env.CEREBRAS_MODEL);
    }
    case 'openrouter': {
      if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');
      const p = createOpenAICompatible({
        name: 'openrouter',
        baseURL: env.OPENROUTER_BASE_URL,
        apiKey: env.OPENROUTER_API_KEY,
        // OpenRouter likes these headers; harmless elsewhere.
        headers: { 'HTTP-Referer': 'https://overclocked.app', 'X-Title': 'OVERCLOCKED' },
        fetch: fetchImpl,
      });
      return p(modelOverride || env.OPENROUTER_MODEL);
    }
    case 'nvidia': {
      if (!env.NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not set');
      const p = createOpenAICompatible({
        name: 'nvidia',
        baseURL: env.NVIDIA_BASE_URL,
        apiKey: env.NVIDIA_API_KEY,
        fetch: fetchImpl,
      });
      return p(modelOverride || env.NVIDIA_MODEL);
    }
    case 'gemini': {
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
      const google = createGoogleGenerativeAI({
        apiKey: env.GEMINI_API_KEY,
        baseURL: env.GEMINI_BASE_URL || undefined,
      });
      return google(modelOverride || env.GEMINI_MODEL);
    }
  }
}

/**
 * Re-wrap an async iterable of text deltas (streamObject's textStream) as an
 * OpenAI-shaped SSE ReadableStream — `data: {choices:[{delta:{content}}]}` frames
 * terminated by `data: [DONE]`. Exported so the unit test can assert the framing
 * with a fake stream, offline (no real model).
 */
export function wrapStreamAsSse(
  textStream: AsyncIterable<string>,
  finalTps?: () => Promise<number | undefined>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of textStream) {
          const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
          controller.enqueue(encoder.encode(frame));
        }
        // Emit the provider's REAL decode rate (if we captured it) as a final
        // frame so the client shows an honest speedometer, not a network-bound
        // effective rate. Best-effort: never block [DONE] on it.
        if (finalTps) {
          try {
            const tps = await finalTps();
            if (typeof tps === 'number' && Number.isFinite(tps) && tps > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tps: Math.round(tps) })}\n\n`));
            }
          } catch {
            /* ignore — fall back to the client's effective estimate */
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        // Log the real cause server-side; emit only a stable code to the client
        // so provider error payloads (which can echo request URL/headers) never
        // reach the browser (H1).
        console.error('[chat] stream failed mid-flight:', err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'upstream_error' })}\n\n`));
        controller.close();
      }
    },
  });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...corsHeaders() } });
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-app-token',
  };
}
