---
sidebar_position: 5
---

# The Stage (React UI)

`src/stage/` — the coin-op arcade cabinet. It renders the race; it never drives
timing (the [engine](./engine) does that). React subscribes to the Zustand store
and re-renders on lane updates.

## The component tree

```
Stage
├── Logo              ← the OVERCLOCKED arcade-cabinet sign (wordmark + mark)
├── Scoreboard        ← per-lane scores + live timer (M:SS or ∞)
├── Lane (×N)        ← one per lane, laid out by grid-template-columns
│   ├── Belt         ← the conveyor; backs up when backlog grows
│   ├── Handler      ← the animal clerk (the emotional engine)
│   ├── FocusCard    ← the manila dossier: pipeline steps + fields + verdict stamp
│   └── HUD          ← speedometer gauge + cleared/backlog bars + coordination chips
├── Footer           ← ROI payoff card + cinematic/sound toggles + agent legend
└── Controls         ← Reset + End + preset switcher (30s / 1m / 5m / ∞)
```

Plus `Banner` (the win screen, with confetti), rendered at the App level. The
human lane's click-to-classify card (`HumanActionPanel`, in
`src/stage/HumanOverlay.tsx`) is an **inline panel rendered inside the human
`Lane` column** (to the right of the AI lanes), not a full-screen modal — so the
bots stay visible while you play.

## State: the Zustand store

`src/store/arena.ts` is the single source of truth for the match: `phase`
(lobby/running/ended), `lanes`, `timeLeft`, `mode`, `summary`. It owns
the `GameEngine` instance and wires its callbacks to `set()`:

- `onLaneUpdate` → updates `lanes[id]` (which `Lane` selects).
- `onTick` → updates `timeLeft`.
- `onEnd` → computes the `MatchSummary` (winner, scores, resolved counts, verdict
  accuracy, ROI) and sets `phase: 'ended'`.

Selectors keep re-renders narrow — each component subscribes only to the slice
it needs.

## The Handler — readability IS the scoreboard

`src/stage/Handler.tsx` is the animal clerk whose slow descent into madness
*is* how you read who's winning (§8: with no numbers, you must instantly read
the mood). Each lane is a different animal — a **badger** (Cerebras), a
**penguin** (the GPU challenger), and a **panda** (Gemini) — but they all share
the *same* SVG layer structure and the *same* animation state machine; only the
body art differs. One SVG with toggleable layers, driven by `stress` (from
backlog) and `winning`:

- **Calm** → smug, feet up, sipping steaming coffee
- **Focused** → leaning in
- **Strained** → wild hair, twitching eye, sweat, stress vein
- **Drowning** → buried in a paper storm, waving "help!" hand, X-X eyes
- **Doom** → ghost rising from a tombstone ("R.I.P. THROUGHPUT")
- **Winning** → crown, flexing bicep, sparkles, victory bounce

The stress thresholds are in `Lane.tsx` (>1 / >3 / >6 backlog). All animations
respect `prefers-reduced-motion`.

## The FocusCard — where coordination is visible

`src/stage/FocusCard.tsx` shows the live parcel's progress through the agent
graph: the **pipeline steps** (Route → Work → Check → Decide) light up as each
agent runs, with ✓/✗/retry states. Fields rubber-stamp in one by one, finished
with an **ACCEPT/REROUTE/HOLD/REFUSE** stamp THWACK (canvas-confetti + audio).
A pass/fail pill + "should be: X" annotation compare against the answer key.

## The lobby

`src/lobby/` — the pre-race screen:
- **TaskExplorer** — browse the 18 task types + their scenarios (with asset
  previews — vision stills and playable conveyor clips), get a feel for the work.
- **RunConfig** — pick the run mode, pipeline depth, challenger/Gemini models,
  mock-vs-live, and the "I Wanna Play" human lane.
- **AgentRoster** (full variant) — the "How it works" panel documenting the
  5-role agent graph for judges.

## The agent roster (surfacing the coordination)

`src/stage/AgentRoster.tsx` + `src/data/agentRoster.ts` — the user-facing view of
the multi-agent graph. Rendered two ways: a **full** panel in the lobby (a themed
**SVG agent-graph diagram** — `AgentGraph`, router → worker → verifier → decision
with the retry loop + escalation branch — plus per-role cards) and a **compact**
legend in the Stage footer (step dots → agent names). Reads from a single data
module so it can't drift from the implemented roles.

## The Logo

`src/stage/Logo.tsx` — the OVERCLOCKED arcade-cabinet sign: an SVG
lightning/processor mark beside the wordmark, themed in Cerebras-orange. Rendered
prominently in the lobby header and the cabinet. Has `size` ('sm' | 'md' | 'lg')
and `tag` props; the mark is `aria-hidden` (the wordmark carries the text).

## Audio + juice

`src/audio/sfx.ts` synthesizes **all** SFX with the WebAudio API (zero binary
assets — instant load, no fetches). The call surface is `play(name)`:

| Sound | When |
|---|---|
| stamp THWACK | a parcel is stamped ACCEPT/REROUTE/HOLD/REFUSE |
| clear blips | each cleared item (pitch rises with the lane's score) |
| crowd swell | `setCrowdIntensity(stress01)` — a rising bed that tracks the most-stressed lane |
| sad trombone | a handler drowns (stress hits 3) |
| win fanfare | the win banner |

`canvas-confetti` fires on clears and the win banner. The sound toggle lives in
the Footer (`setSoundEnabled`); audio is user-gesture-gated (`resumeAudio` on
first interaction, per browser autoplay policy).

## Accessibility

The Stage was audited against **WCAG 2.1 AA** and fixed:

- **Contrast ≥ 4.5:1** across the cabinet (lane labels, HUD numbers, timer).
- **Focus-visible** rings on every interactive control (global `:focus-visible`
  rule in `src/index.css`), so keyboard users see where they are without
  cluttering mouse use.
- **Dialog semantics** — the modal surface is the lobby task-explorer image
  lightbox (`role="dialog"` + `aria-modal`, Escape-to-close, click-outside to
  dismiss). The human lane's click-to-classify card is an inline `role="group"`
  region (no modal), so the bots stay visible while you play.
- **Labelled controls** — buttons and inputs carry `title`/`aria-label` so screen
  readers announce them (the glyphs alone aren't enough).
- **Reduced motion** — every animation (the handler moods, the belt, confetti)
  honours `prefers-reduced-motion`, short-circuited in the `<Style>` block and
  the `sfx.ts` crowd bed.

See [Operations: Security](../ops/security) for the trust model; the
[Handler](#the-handler--readability-is-the-scoreboard) mood states
above are the primary readability path (and are motion-independent in their
resting frames).
