---
sidebar_position: 1
slug: /
---

# Introduction

**OVERCLOCKED** is a live, arcade-style race where AI agents compete to clear a
real enterprise backlog. By default two model lanes race — Cerebras and a
GPU-hosted challenger (an optional third Gemini lane can be toggled on) —
processing the **same** warehouse sortation tasks (label parsing, damage
assessment, customs classification, hazmat screening), and the scoreboard
encodes **throughput × accuracy**, so speed *is* the game.

This is the developer documentation. It explains how the app works end to end —
the engine, the multi-agent pipeline, the task/grader system, the Cloudflare
Worker backend, and the React stage — so you can extend it confidently.

:::info Who this is for
A developer who has the repo open and wants to understand or change it. It
assumes familiarity with TypeScript, React, and the general idea of an LLM app.
:::

## What you'll find here

- **[Core Concepts](./concepts/race-and-scoring)** — how a race is scored, what
  a task is, the multi-agent coordination graph, and the fairness contract.
- **[Architecture](./architecture/overview)** — the four layers (engine →
  orchestrator → agents → stage) and how data flows between them.
- **[Extending](./extending/add-a-task)** — step-by-step guides for adding a
  task, authoring scenario data, and wiring a new model provider.
- **[Operations](./ops/running)** — running locally, the test suite, and the
  security model.

## The 30-second mental model

```
STAGE (React)         ← renders the race; subscribes to the store
  ▲ subscribes
ARENA STORE (Zustand)  ← holds all match state
  ▲ drives
ENGINE (framework-free)  ← tick loop: arrival pump → pipeline → grade → score
  │
  ├── TASK SYSTEM     ← 18 task types, each with a Zod schema + grader
  ├── ORCHESTRATOR    ← router → worker → checker → escalation per parcel
  └── AGENT CLIENTS   ← Cerebras | GPU | Gemini | Human | Mock
```

Every parcel runs through a **coordinated agent graph** (router → worker →
checker → escalation) in live mode — mock lanes deterministically collapse to a
single worker pass, identically across lanes. Either way, all lanes get the
**identical scenario sequence** and are **graded identically** — so the *only*
variable is the silicon. That's the fairness contract the whole demo rests on.

## Quick numbers

| | |
|---|---|
| Task types | 18 (vision / document / text / video) |
| Scenarios | 111, in `data/scenarios/*.json` |
| Agent roles | 5 (router, worker, checker, escalation, orchestrator) |
| Model lanes | 2 by default (Cerebras vs a GPU challenger — OpenRouter or NVIDIA NIM) + optional Gemini + optional human |
| Run modes | 6 (15s / 30s / 1m / 5m / endless / sudden-death) |
| Unit tests | 179 across 19 files (Vitest, all offline) |
| E2E tests | 10 across 2 files (Playwright, the lobby→race→banner journey) |
| Accessibility | WCAG 2.1 AA audited (contrast, focus-visible, ARIA, reduced-motion) |

## Where to start reading

If you want to understand **why** it's built this way, start with
[Core Concepts](./concepts/race-and-scoring). If you want to **change** it, jump
to [Architecture](./architecture/overview) and then the relevant
[Extending](./extending/add-a-task) guide.
