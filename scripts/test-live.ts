/**
 * test-live.ts — run each scenario through the REAL Gemini path (the same prompt
 * + schema the worker uses), with the user's GEMINI_API_KEY from .dev.vars, to
 * answer three things empirically:
 *   1. The real tokens/sec (from the provider's own usage stats + the generation
 *      window), so we can calibrate the live speedometer.
 *   2. Whether each scenario is a GENUINE failure (worker output graded vs truth).
 *   3. Whether the Verifier (checker) over-flags CORRECT outputs (the "caught" rate).
 *
 * The key is read from .dev.vars and never printed. Usage:
 *   npx tsx scripts/test-live.ts            # small sample
 *   npx tsx scripts/test-live.ts --all      # every scenario
 *   npx tsx scripts/test-live.ts --limit 20
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamObject } from 'ai';
import { getTaskType } from '../src/tasks/registry';
import { CheckerSchema } from '../src/tasks/schemas';
import { schemaToInstruction } from '../src/tasks/prompt';
import { deriveVerdict } from '../src/orchestrator/verdict';
// Use the REAL app parser so the test reflects the live path exactly — incl. the
// schema-aware coercion that unwraps Cerebras's ["jam"]-style enum wrapping.
import { parseOutput } from '../src/agents/createAgent';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const SCEN = resolve(ROOT, 'data', 'scenarios');

// ── secrets (read, never print) ─────────────────────────────────────────────
function devVar(name: string): string | undefined {
  try {
    const m = readFileSync(resolve(ROOT, '.dev.vars'), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
    return m?.[1]?.trim().replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}
const PROVIDER = (() => {
  const i = process.argv.indexOf('--provider');
  return i >= 0 ? process.argv[i + 1] : 'gemini';
})();
function buildModel(): { model: any; label: string } {
  if (PROVIDER === 'cerebras') {
    const key = devVar('CEREBRAS_API_KEY');
    if (!key || /your-.*-key/.test(key)) throw new Error('CEREBRAS_API_KEY not set in .dev.vars');
    const p = createOpenAICompatible({ name: 'cerebras', baseURL: devVar('CEREBRAS_BASE_URL') || 'https://api.cerebras.ai/v1', apiKey: key });
    return { model: p(devVar('CEREBRAS_MODEL') || 'gemma-4-31b'), label: devVar('CEREBRAS_MODEL') || 'gemma-4-31b' };
  }
  if (PROVIDER === 'openrouter' || PROVIDER === 'nvidia') {
    const isNv = PROVIDER === 'nvidia';
    const key = devVar(isNv ? 'NVIDIA_API_KEY' : 'OPENROUTER_API_KEY');
    if (!key || /your-.*-key/.test(key)) throw new Error(`${PROVIDER} key not set in .dev.vars`);
    const p = createOpenAICompatible({ name: PROVIDER, baseURL: isNv ? 'https://integrate.api.nvidia.com/v1' : 'https://openrouter.ai/api/v1', apiKey: key });
    return { model: p('google/gemma-4-31b-it'), label: 'google/gemma-4-31b-it' };
  }
  const key = devVar('GEMINI_API_KEY');
  if (!key || /your-.*-key/.test(key)) throw new Error('GEMINI_API_KEY not set in .dev.vars');
  const m = devVar('GEMINI_MODEL') || 'gemini-3.1-flash-lite';
  return { model: createGoogleGenerativeAI({ apiKey: key })(m), label: m };
}
const built = buildModel();
const model = built.model;
const MODEL = built.label;

// ── helpers mirroring the worker/agent path ─────────────────────────────────
function nodeDataUrl(imageUrl: string): string {
  const p = resolve(PUBLIC, imageUrl.replace(/^\//, ''));
  const buf = readFileSync(p);
  const ext = imageUrl.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  return `data:${ext};base64,${buf.toString('base64')}`;
}
function workerSystem(task: any): string {
  return [
    `You are a specialist ${task.label} agent on a warehouse sortation line.`,
    `Modality: ${task.modality}. Difficulty: ${task.difficulty}.`,
    schemaToInstruction(task.outputSchema),
    `Return ONLY the JSON object. No prose, no markdown.`,
  ].join('\n');
}
/** Interleave "Frame k of N" captions with the frame images (video modality). */
function frameParts(frames: string[]): any[] {
  const parts: any[] = [];
  frames.forEach((f, i) => {
    parts.push({ type: 'text', text: `Frame ${i + 1} of ${frames.length}:` });
    parts.push({ type: 'image', image: nodeDataUrl(f) });
  });
  return parts;
}
function userContent(scn: any): any {
  const text = scn.input.text || 'Resolve this parcel exception.';
  if (scn.input.frames?.length) {
    return [{ type: 'text', text }, ...frameParts(scn.input.frames)];
  }
  if (scn.input.imageUrl) {
    return [
      { type: 'text', text },
      { type: 'image', image: nodeDataUrl(scn.input.imageUrl) },
    ];
  }
  return text;
}
const approxTokens = (s: string) => Math.max(1, Math.round(s.length / 4));

interface CallResult {
  text: string;
  parsed: any;
  completionTokens: number | undefined;
  ttftMs: number; // request → first chunk
  genMs: number; // first chunk → last chunk
  totalMs: number;
  chunks: number;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const m = e instanceof Error ? e.message : String(e);
      if (/429|resource_exhausted|quota|rate.?limit|overloaded|503/i.test(m) && i < tries - 1) {
        await sleep(2000 * (i + 1));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

async function callModel(schema: z.ZodType<any>, system: string, content: any): Promise<CallResult> {
  return withRetry(() => callOnce(schema, system, content));
}

async function callOnce(schema: z.ZodType<any>, system: string, content: any): Promise<CallResult> {
  const start = performance.now();
  let firstAt = 0;
  let lastAt = 0;
  let chunks = 0;
  let full = '';
  const result = streamObject({
    model,
    schema,
    system,
    messages: [{ role: 'user', content }],
    temperature: 0.2,
    maxOutputTokens: 512,
    onError: () => {},
  });
  for await (const delta of result.textStream) {
    const now = performance.now();
    if (!firstAt) firstAt = now;
    lastAt = now;
    full += delta;
    chunks++;
  }
  let completionTokens: number | undefined;
  try {
    const u = await result.usage;
    completionTokens = (u as any)?.completionTokens ?? (u as any)?.outputTokens;
    if (process.env.DUMP) {
      console.error('usage:', JSON.stringify(u));
      try {
        console.error('providerMetadata:', JSON.stringify(await result.providerMetadata));
      } catch (e) {
        console.error('pm err', e);
      }
      try {
        const resp: any = await (result as any).response;
        console.error('response:', JSON.stringify(resp)?.slice(0, 2000));
      } catch (e) {
        console.error('resp err', e);
      }
    }
  } catch {
    /* ignore */
  }
  let parsed: any;
  try {
    parsed = await result.object;
  } catch {
    parsed = parseOutput(full, schema);
  }
  const end = performance.now();
  return {
    text: full,
    parsed,
    completionTokens,
    ttftMs: firstAt ? firstAt - start : end - start,
    genMs: firstAt ? lastAt - firstAt : 0,
    totalMs: end - start,
    chunks,
  };
}

function checkerSystem(): string {
  return [
    'You are an independent Verifier on a warehouse sortation line.',
    "Review the worker agent's structured output against the source — the text",
    'AND the attached image when one is present.',
    schemaToInstruction(CheckerSchema),
    'Default to pass=true. Set pass=false ONLY when you can point to a specific,',
    'concrete mismatch you can actually see in the source/image (a wrong code, a',
    'value that contradicts the evidence). Uncertainty, or "plausible but I am not',
    'sure", is NOT grounds to fail. confidence is your 0..1 certainty.',
  ].join('\n');
}
function checkerContent(scn: any, workerOutput: any): any {
  const text = `Source:\n${scn.input.text ?? '(see image)'}\n\nWorker output to verify:\n${JSON.stringify(workerOutput, null, 2)}`;
  if (scn.input.frames?.length) {
    return [{ type: 'text', text }, ...frameParts(scn.input.frames)];
  }
  if (scn.input.imageUrl) {
    return [
      { type: 'text', text },
      { type: 'image', image: nodeDataUrl(scn.input.imageUrl) },
    ];
  }
  return text;
}

// ── load scenarios ──────────────────────────────────────────────────────────
function loadScenarios(): any[] {
  const files = readdirSync(SCEN).filter((f) => f.endsWith('.json'));
  const all: any[] = [];
  for (const f of files) all.push(...JSON.parse(readFileSync(resolve(SCEN, f), 'utf8')));
  return all;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const limArg = args.indexOf('--limit');
  let scenarios = loadScenarios();
  const taskArg = args.indexOf('--task');
  if (taskArg >= 0) {
    const t = args[taskArg + 1];
    scenarios = scenarios.filter((s) => s.taskTypeId === t);
  } else if (args.includes('--vision')) {
    scenarios = scenarios.filter((s) => getTaskType(s.taskTypeId).modality === 'vision');
  } else if (!all) {
    const lim = limArg >= 0 ? Number(args[limArg + 1]) : 0;
    if (lim > 0) {
      scenarios = scenarios.slice(0, lim);
    } else {
      // default: up to 2 per task type for a fast signal
      const seen: Record<string, number> = {};
      scenarios = scenarios.filter((s) => ((seen[s.taskTypeId] = (seen[s.taskTypeId] ?? 0) + 1) <= 2));
    }
  }
  console.log(`Model: ${MODEL} · ${scenarios.length} scenarios · checker on each\n`);

  const rows: any[] = [];
  for (const scn of scenarios) {
    const task = getTaskType(scn.taskTypeId);
    let row: any = { id: scn.id, task: scn.taskTypeId, modality: task.modality, diff: scn.difficulty, adv: !!scn.adversarial };
    try {
      // 1. worker call
      const w = await callModel(task.outputSchema, workerSystem(task), userContent(scn));
      const grade = task.grade(w.parsed ?? {}, scn.groundTruth);
      const verdict = deriveVerdict(scn.taskTypeId, (w.parsed ?? {}) as any);
      const verdictOk = verdict === scn.correctOutcome.verdict;
      const resolved = scn.correctOutcome.pass && grade.partial > 0 && verdictOk;
      const tpsReal = w.genMs >= 1 && w.completionTokens ? (w.completionTokens / w.genMs) * 1000 : null;
      const tpsApprox = w.genMs >= 1 ? (approxTokens(w.text) / w.genMs) * 1000 : null;
      const tpsTotal = w.completionTokens ? (w.completionTokens / w.totalMs) * 1000 : null;

      // 2. checker call (does it flag this output?) — now WITH the image on vision
      const c = await callModel(CheckerSchema, checkerSystem(), checkerContent(scn, w.parsed));
      const checkerPass: boolean | undefined = c.parsed?.pass;

      row = {
        ...row,
        parsed: w.parsed,
        compTokens: w.completionTokens,
        chunks: w.chunks,
        ttftMs: Math.round(w.ttftMs),
        genMs: Math.round(w.genMs),
        totalMs: Math.round(w.totalMs),
        tpsReal: tpsReal != null ? Math.round(tpsReal) : null,
        tpsApprox: tpsApprox != null ? Math.round(tpsApprox) : null,
        tpsTotal: tpsTotal != null ? Math.round(tpsTotal) : null,
        fields: `${grade.fields?.filter((f: any) => f.ok).length}/${grade.fields?.length}`,
        correct: grade.correct,
        resolved,
        verdict: `${verdict}${verdictOk ? '' : `≠${scn.correctOutcome.verdict}`}`,
        checkerPass,
        // The Verifier "caught" a CORRECT output = over-flag (false alarm)
        checkerOverFlag: resolved && checkerPass === false,
      };
      console.log(
        `${pad(scn.id, 6)} ${pad(scn.taskTypeId, 22)} ${pad(task.modality, 9)} ` +
          `tok=${pad(String(w.completionTokens ?? '?'), 4)} chunks=${pad(String(w.chunks), 3)} ` +
          `ttft=${pad(String(Math.round(w.ttftMs)), 5)}ms gen=${pad(String(Math.round(w.genMs)), 5)}ms ` +
          `tps_real=${pad(String(tpsReal != null ? Math.round(tpsReal) : '—'), 5)} tps_len/4=${pad(String(tpsApprox != null ? Math.round(tpsApprox) : '—'), 5)} ` +
          `| ${row.fields} ${resolved ? '✓resolved' : '✗'} ${row.verdict} ` +
          `chk=${checkerPass === false ? 'FAIL' : checkerPass === true ? 'pass' : '?'}${row.checkerOverFlag ? ' ⚠OVER-FLAG' : ''}`,
      );
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
      console.log(`${pad(scn.id, 6)} ${pad(scn.taskTypeId, 22)} ERROR: ${row.error}`);
    }
    rows.push(row);
    await sleep(400);
  }

  // ── aggregate ───────────────────────────────────────────────────────────
  const ok = rows.filter((r) => !r.error);
  // EFFECTIVE rate = real completion tokens / total call time. (The gen-window
  // numbers below are noise — short objects ship in 1–2 chunks, so first→last
  // chunk isn't a real generation window.)
  const effVals = ok.map((r) => (r.compTokens && r.totalMs ? Math.round((r.compTokens / r.totalMs) * 1000) : null)).filter((v) => v != null) as number[];
  const tpsRealVals = ok.map((r) => r.tpsReal).filter((v) => v != null) as number[];
  const tpsApproxVals = ok.map((r) => r.tpsApprox).filter((v) => v != null) as number[];
  const med = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  const mean = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
  const resolvedN = ok.filter((r) => r.resolved).length;
  const overFlagN = ok.filter((r) => r.checkerOverFlag).length;
  const checkerFailN = ok.filter((r) => r.checkerPass === false).length;

  console.log('\n──────── SUMMARY ────────');
  console.log(`scenarios run: ${ok.length}/${rows.length}  (errors: ${rows.length - ok.length})`);
  console.log(`RESOLVED (worker correct + right verdict): ${resolvedN}/${ok.length} = ${Math.round((100 * resolvedN) / ok.length)}%`);
  console.log(`tokens/sec EFFECTIVE (real tokens / total time): median ${med(effVals)}  mean ${mean(effVals)}  ← the honest number`);
  console.log(`  (gen-window numbers are noise: real ${med(tpsRealVals)} / len4 ${med(tpsApproxVals)} — short objects ship in 1–2 chunks)`);
  console.log(`Verifier said FAIL on ${checkerFailN}/${ok.length} outputs; of those, ${overFlagN} were on CORRECT outputs (over-flags)`);
  console.log('\nBy task (resolved):');
  const byTask: Record<string, { n: number; r: number }> = {};
  for (const r of ok) {
    byTask[r.task] = byTask[r.task] ?? { n: 0, r: 0 };
    byTask[r.task].n++;
    if (r.resolved) byTask[r.task].r++;
  }
  for (const [t, v] of Object.entries(byTask).sort()) console.log(`  ${pad(t, 22)} ${v.r}/${v.n}`);

  const out = resolve(process.env.SCRATCH || ROOT, 'test-live-report.json');
  writeFileSync(out, JSON.stringify({ model: MODEL, rows }, null, 2));
  console.log(`\nDetailed report → ${out}`);
}

function pad(s: string, n: number): string {
  return (s + ' '.repeat(n)).slice(0, n);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
