# ⚡ OVERCLOCKED — Sortation Arena

> **AI agents race to clear a real enterprise backlog. Same model, different silicon.**
> Score = throughput × accuracy, so speed *is* the game.
>
> Built for the **Cerebras × Google DeepMind Gemma 4 hackathon** — a multi-agent,
> multimodal, enterprise demo powered by **Gemma 4 31B on Cerebras**.

**OVERCLOCKED** turns a dull-but-real enterprise problem — a warehouse **sortation** backlog,
where every parcel needs a fast *and* correct decision — into a live, arcade-style race.
Two lanes go head to head: **Cerebras + Gemma 4 31B** (wafer-scale) versus the **same
Gemma 4 31B, GPU-hosted** (the challenger), so the *only* variable is the silicon. An
optional **Gemini** lane and a **human** lane can join. Every parcel is routed through a
coordinated **multi-agent graph** and machine-graded against ground truth — while a
**badger / penguin / panda** clerk in each lane visibly drowns in paper when its silicon
falls behind. Live tokens/sec per lane, a rubber-stamp **THWACK** on every cleared item,
and an **ROI card** totting up the £ saved vs. manual processing.

One build, mapped to all three hackathon tracks.

---

## Built for all three tracks

| Track | How OVERCLOCKED hits it |
|---|---|
| 🤖 **Track 1 — Multiverse Agents** *(multi-agent + multimodal — our headline)* | Every parcel runs a **5-role agent graph** — router → worker → checker → escalation specialist — with **18 worker specialists** dispatched by task type. The work is genuinely **multimodal**: **vision** (label photos, damage, hazmat placards, seal tamper), **document** (customs invoices, manifests), **text** (tariff, routing, SLA), and **video** — a conveyor-incident clip sampled to keyframes, so the model reads *motion over time* (a parcel that jams, falls off the belt, or is crushed). Gemma 4 31B's image understanding is the hero modality, and the agents *coordinate* — the checker bounces bad work back for a retry; the specialist makes the final call on high-stakes items. |
| 🏭 **Track 3 — Enterprise Impact** | The queue is real back-office sortation work, machine-graded against ground truth, with an **ROI payoff card** (parcels cleared · accuracy · £ saved vs. manual). Production-minded: API keys live **only** in a Cloudflare Worker (never the browser), every output is **schema-constrained** (structured outputs), and a **circuit breaker** trips a failed provider lane to **OFFLINE** so a missing key or bad model id never kills the demo — the other lanes race on. |
| 📣 **Track 2 — People's Choice** *(social)* | It reads as a *game*: conveyor belts that jam, a THWACK stamp per clear, animal clerks that lose their minds — drowning in paper, a ghost rising from a "R.I.P. THROUGHPUT" tombstone — a crown + sparkles on the winner, sudden-death mode. "Watch AIs race to clear a warehouse backlog while their animal clerks melt down" is a scroll-stopper, and the **side-by-side Cerebras-vs-GPU speed gap is the punchline.** |

**Why Cerebras wins the race.** A competitive *agentic* loop is latency-bound by design —
each parcel makes several **sequential** model calls (route → work → check → escalate). Every
hop multiplies per-item latency, so wafer-scale inference compounds its lead and the GPU
lane's conveyor visibly **jams** under the *identical* pipeline. The race itself *is* the
speed benchmark — exactly the side-by-side comparison the demo video calls for.

## At a glance

| | |
|---|---|
| **Primary model** | Gemma 4 31B on **Cerebras** (wafer-scale) — vs. the same model GPU-hosted |
| **Agents** | 5 roles (router · worker · checker · escalation · orchestrator) × **18 task specialists** |
| **Modalities** | Vision · Document · Text · Video — multimodal via Gemma 4 image inputs (video = sampled keyframes) |
| **Task pool** | **18 task types · 111 scenarios**, Zod-validated at load, machine-graded vs. ground truth |
| **Model lanes** | 2 by default (Cerebras vs a GPU challenger — **OpenRouter or NVIDIA NIM**, toggle in the lobby) + optional Gemini + optional human |
| **Resilience** | Mock-first (zero-API fallback) · per-lane OFFLINE circuit breaker on provider failure |
| **Tests** | **179** unit (Vitest, offline) + **10** e2e (Playwright) — all green |
| **Stack** | React + Zustand + Tailwind · Cloudflare Worker · Vercel AI SDK (`streamObject` + Zod) |

---

## Quick start

Requires **Node 18+** (built on Node 22). Uses npm.

```bash
npm install           # install dependencies

# 1) Run the WHOLE thing on MOCK lanes — zero API calls, races immediately.
#    (fake-first: the engine runs end-to-end without any provider.)
npm run dev           # Vite app on http://localhost:5173
```

Open the lobby, confirm **"● MOCK LANES"**, pick a run time, hit **GO**.

### Going live (real inference)

The browser never holds API keys. A Cloudflare Worker injects secrets and streams the
model response back so the client measures **real tokens/sec**.

```bash
# In a second terminal — start the agent Worker:
cp .dev.vars.example .dev.vars      # then put real keys in .dev.vars
npm run dev:worker                  # wrangler dev on http://localhost:8787

# Back in the app terminal, the Vite proxy forwards /api -> the Worker.
```

Then in the lobby, **flip "Mock lanes" OFF** and hit GO.

> Set the real **Gemma 4 31B** model ids in `wrangler.toml` (`CEREBRAS_MODEL`,
> `OPENROUTER_MODEL`) — the headline demo is the *same* model on both lanes so the only
> variable is silicon. Switch the challenger for exhibition rounds.

> **Missing a key? It won't crash the demo.** If a provider isn't configured (or a model id
> is wrong), that lane trips to **OFFLINE** after its first failures and stops calling the
> provider — the other lanes race on and the fastest survivor sets the pace. So you can
> demo Cerebras-vs-Gemini even before the GPU key lands. Only the lanes you've keyed need
> to work. Add Gemini (off by default) by toggling it on and setting `GEMINI_API_KEY`.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (frontend). Defaults to mock lanes. |
| `npm run dev:worker` | Cloudflare Worker (`wrangler dev`) — the agent backend. |
| `npm run dev:all` | Run frontend + worker together via `concurrently`. |
| `npm run build` | Type-check + production build to `dist/`. |
| `npm run typecheck` | TypeScript check across app + worker. |
| `npm test` | Vitest — grader + scenario-pool + engine + pipeline tests (179 tests). |
| `npm run test:e2e` | Playwright — the lobby→race→winner-banner journey (10 tests). |
| `npm run test:all` | Vitest + Playwright together. |
| `npm run gen:assets` | Regenerate the realistic PNG "photos" for vision tasks (rendered from each scenario's ground truth). |
| `npm run datagen` | Claude-powered scenario generator (`scripts/generate.ts`) — see [authoring data](./docs/docs/extending/data.md). |
| `npm run deploy:worker` | Deploy the Worker to Cloudflare. |
| `npm run deploy:pages` | Deploy the built app to Cloudflare Pages. |

---

## Architecture

Four clean layers (see the [developer documentation](./docs/docs/intro.md) for the full spec):

```
STAGE (React + Framer Motion + Tailwind)
  Belt · Folder/Focus cards · Handler · Scoreboard · HUD
        ▲ subscribes
ARENA STORE (Zustand) — queue · lanes · scores · timer · phase
        ▲ drives
ENGINE (framework-free, deterministic tick loop)
  arrival pump → per-item PIPELINE in each lane → grade → score/backlog/tokens-per-sec
        │
  ┌─────┴──────────┬──────────────────┬───────────────────┐
  TASK SYSTEM       ORCHESTRATOR        AGENT CLIENTS
  registry          router → worker     unified AgentClient
  scenario pool     → checker →         → Cerebras | GPU
  GRADERS (Zod)     escalate            | Human | Mock
```

**The shared contract** (`src/shared/contract.ts`) holds it together: every task returns a
small structured object validated by Zod and graded against known ground truth. Never
open-ended prose — if a task also produces a nice reply, grade the structured side-channel.

### Adding a task (the blueprint test)

Per the design spec, adding task #18+ should mean writing **one config** and nothing else:

1. Add a Zod schema in `src/tasks/schemas.ts` + a grader in `src/tasks/graders.ts`, and
   register both in the `SCHEMA_BY_TASK` / `GRADERS` maps.
2. Add a `TaskType` entry to `src/tasks/types/index.ts`.
3. Add scenarios to `data/scenarios/<task-id>.json`.

The registry, orchestrator, engine, and UI all derive from the schema — no engine changes.

### The scenario pool (data is separate from code)

Scenario data lives in **`data/scenarios/<task-id>.json`** — one file per task type, kept
deliberately separate from the source. The loader (`src/data/scenarios.ts`) imports every
`*.json` via Vite's `import.meta.glob` and **Zod-validates each scenario against its task
schema at load time** — a malformed scenario fails the build, never reaching the demo
(every scenario is validated before it enters the pool).

**18 task types, 111 scenarios** shipped, spread across all four modalities:

| Modality | Tasks |
|---|---|
| **Vision** | label-parse, damage-assessment, hazmat-detection, seal-tamper, dim-weight, pallet-check, handwritten-label |
| **Document** | customs-invoice, manifest-recon, docs-completeness |
| **Text** | tariff-classification, exception-routing, address-validation, carrier-select, sla-risk, rma-disposition, restricted-screening |
| **Video** | conveyor-incident — a belt clip sampled to keyframes; the model classifies motion (clear / jam / fall / crush) |

Each task has 5–7 scenarios across difficulty tiers, with adversarial highlight cases
(tamper, hazmat mislabel, customs undervaluation, counterfeit goods) salted in. Re-run
`npm run gen:assets` to regenerate the vision "photos" — realistic **PNG**s rendered
from each scenario's ground truth (a crushed corner, a UN hazard placard, the actual
carton count), so they're solvable vision tasks rather than OCR of a printed verdict.
The same generator renders the **conveyor clips**: a smooth MP4 (composited with
ffmpeg) plus the sampled keyframes the model actually consumes — Gemma on Cerebras
ingests text + images, so a clip is sampled to frames and **every lane gets the same
frames** (the fair, provider-agnostic path to video understanding).

---

## File structure

```
src/
  shared/        contract.ts            — the types that hold it all together
  engine/        loop.ts  arrivalPump.ts  scoring.ts
  agents/        createAgent.ts  streaming.ts  clients.ts  roles.ts  image.ts
  orchestrator/  pipeline.ts  policy.ts  trace.ts
  tasks/         registry.ts  schemas.ts  graders.ts  prompt.ts  types/
  data/          scenarios.ts (loader)  agentRoster.ts — imports + validates the pool
  store/         arena.ts (zustand)
  stage/         Stage  Scoreboard  Lane  Belt  FocusCard  Handler  HUD  Footer
                 Banner  HumanOverlay  humanInput  Controls  AgentRoster  Logo
  lobby/         Lobby  TaskExplorer  RunConfig
  audio/         sfx.ts (WebAudio synth — zero asset weight)
  api/           provider.ts
worker/          index.ts (Cloudflare Worker — AI SDK host, key injection, streaming)
wrangler.toml    Worker config (at repo root) — provider base URLs + model ids
data/scenarios/  *.json — one file per task type (111 scenarios, truth-first)
public/data/assets/   generated PNG "photos" for vision tasks + conveyor clips (frames + mp4)
scripts/        gen-assets.ts  generate.ts  add-correct-outcome.ts
docs/           Docusaurus developer documentation site (own package.json)
e2e/            Playwright end-to-end tests (race.spec.ts, human.spec.ts)
```

---

## Modes & controls

Six run modes, switchable from the lobby before GO or from the **preset
switcher** in the Stage (which restarts the race at the chosen window):

- **15s Blitz** — max-frenzy clip.
- **30s Short** — social cut.
- **60s Standard** — the submission video / live narrate-to-judges.
- **5 min Extended** — long demo / narration.
- **Endless** — runs until you stop it; counts elapsed time up (∞). Draws
  endlessly from the full pool, same tasks for every lane (fairness-critical).
- **Sudden Death** — arrival rate ramps until one handler drowns.

During a race, the **Controls** bar offers the preset switcher (which restarts at
the chosen window), **↺ Reset** (back to lobby), and **⏹ End** (score
immediately). There is deliberately no pause — the lanes are live agents, so
freezing the clock can't freeze in-flight model calls; End or Reset a run instead.

- **Pipeline depth toggle** — single-agent ↔ full graph. Great exhibition beat: show the
  accuracy lift the checker buys, and that Cerebras still wins on speed at full depth.
- **I Wanna Play** — a human races the bots on the same queue (and gets crushed).

---

## Juice & accessibility

- **The animal clerks.** Each lane is a different animal — **badger** (Cerebras),
  **penguin** (the GPU challenger), **panda** (Gemini) — sharing one animation
  state machine. Their mood *is* the scoreboard: smug when ahead, sweating and
  twitching when strained, buried under a paper storm + waving a help-hand when
  drowning, a ghost rising from an "R.I.P. THROUGHPUT" tombstone when doomed, a
  crown + sparkles when winning.
- **Audio.** `src/audio/sfx.ts` synthesizes all SFX with the WebAudio API (zero
  binary assets): the stamp THWACK, per-clear blips, a rising crowd swell that
  tracks the most-stressed lane, a sad trombone on drowning, a win fanfare.
  Toggle from the Footer; respects the reduced-motion path.
- **Accessibility.** WCAG 2.1 AA audited: colour contrast ≥4.5:1 across the
  cabinet, visible focus rings on every control, semantic landmarks + ARIA
  labels, and every animation honours `prefers-reduced-motion`. The "I Wanna
  Play" lane is an inline `role="group"` panel with labelled controls (so the
  bots stay visible while you play); the task-explorer image lightbox is the
  `role="dialog"`/`aria-modal` surface.

## Documentation

Full developer documentation lives in **`docs/`** (a Docusaurus site). Run it
locally:

```bash
cd docs && npm install && npm start    # http://localhost:3000
```

It covers the engine, the multi-agent pipeline, the task/grader system, the
Cloudflare Worker backend, and the React stage — plus how-to guides for adding
tasks, authoring scenario data, and wiring providers. The security model (key
isolation, SSRF guard, error redaction) is documented under
[Operations → Security](./docs/docs/ops/security.md).

---

## Day-one verification (do before going live)

- [ ] Cerebras serves **Gemma 4 31B** and the endpoint accepts **image inputs** (vision is
      the hero modality — unblocks label/damage/hazmat/tamper tasks).
- [ ] The **same Gemma 4 31B** is available **GPU-hosted** (OpenRouter) with image input.
- [ ] Both endpoints are **OpenAI-compatible** with streaming (they are) → the unified client.
- [ ] Set a **token spend cap** for dev runs.

If image input is unsupported on the Cerebras 31B endpoint, the hero tasks pivot to
document/text — still a great speed race. (The bundled vision assets are **PNG**, so
they're accepted wherever image input works at all.)

---

## Deploying to Cloudflare

The app (a static Pages site) and the Worker (the key-injecting agent backend)
deploy **separately**, then have to be wired together so the browser can reach
`/api`. The Vite dev proxy is dev-only — it does **not** exist in production.

1. **Auth:** `wrangler login` (or set `CLOUDFLARE_ACCOUNT_ID`).
2. **Set the Worker secrets** (never committed):
   ```bash
   wrangler secret put CEREBRAS_API_KEY
   wrangler secret put OPENROUTER_API_KEY
   wrangler secret put GEMINI_API_KEY
   ```
3. **Replace the model-id placeholders** in [`wrangler.toml`](./wrangler.toml)
   with the exact ids your providers serve (see the ⚠ callout there).
4. **Deploy the Worker** and note its URL:
   ```bash
   npm run deploy:worker          # → https://overclocked-worker.<subdomain>.workers.dev
   ```
5. **Wire `/api` → Worker** (pick ONE):
   - **Direct (recommended, best metric fidelity):** copy `.env.production.example`
     → `.env.production`, set `VITE_AGENT_BASE` to the Worker URL. The client calls
     the Worker directly (CORS is already `*`).
   - **Same-origin proxy:** copy `public/_redirects.example` → `public/_redirects`,
     fill in the Worker URL, and build with `VITE_AGENT_BASE` **unset**.
6. **Build + deploy the app:**
   ```bash
   npm run build && npm run deploy:pages
   ```
7. **Verify routing on the live origin:** `GET /api/health` returns `{ok:true}`
   and `GET /api/config` shows `ready:true` for each provider whose key you set.
   Then open the lobby, flip **Mock lanes OFF**, and race.

---

## License

[MIT](./LICENSE) — a hackathon project built for the Cerebras × Google DeepMind
Gemma 4 hackathon. See the [developer documentation](./docs/docs/intro.md) for
the full design spec.
