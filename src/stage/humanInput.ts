/**
 * Human-input resolver — bridges the engine's "await a human answer" need to the
 * UI. The engine's human lane calls this resolver with a scenario + task; it
 * returns a promise that resolves when the player picks an answer in the
 * click-to-classify overlay.
 *
 * A tiny pub/sub: the overlay subscribes to incoming questions and submits
 * answers back. The resolver holds at most one pending question (the human is
 * single-threaded — which is the joke: they get crushed).
 */
import type { TaskScenario, TaskType } from '../shared/contract';

export interface HumanQuestion {
  id: number;
  scenario: TaskScenario;
  task: TaskType;
  resolve: (answer: Record<string, unknown>) => void;
}

type Listener = (q: HumanQuestion | null) => void;

let current: HumanQuestion | null = null;
const listeners = new Set<Listener>();
let counter = 0;

/** The resolver handed to makeHumanClient — returns a promise per item. */
export function humanResolver(scenario: TaskScenario, task: TaskType): Promise<unknown> {
  return new Promise((resolve) => {
    current = { id: ++counter, scenario, task, resolve: resolve as (a: Record<string, unknown>) => void };
    emit();
    // The human lane must time out eventually so a stalled game still ends —
    // auto-answer with defaults after 30s (the round is likely over by then).
    setTimeout(() => {
      if (current?.id === counter) {
        submit(defaultAnswer(task));
      }
    }, 30000);
  });
}

/** Submit the player's chosen answer for the current question. */
export function submit(answer: Record<string, unknown>): void {
  if (!current) return;
  const q = current;
  current = null;
  emit();
  q.resolve(answer);
}

/** Skip / forfeit the current question (counts as a miss). */
export function forfeit(): void {
  submit({});
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

export function getCurrent(): HumanQuestion | null {
  return current;
}

function emit(): void {
  for (const fn of listeners) fn(current);
}

/** A schema-shaped default answer (all wrong/empty) so the grader marks it
 *  wrong when the human times out or skips. Derived from the task's declared
 *  humanControls — NOT Zod internals (which differ across Zod v3/v4). */
function defaultAnswer(task: TaskType): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of task.humanControls ?? []) {
    // A deliberately-wrong default per kind: enums pick an invalid sentinel,
    // booleans default false, numbers 0, text '' — none will match ground truth.
    out[c.key] = c.kind === 'enum' ? '__skipped__' : c.kind === 'boolean' ? false : c.kind === 'number' ? -1 : '';
  }
  return out;
}
