/**
 * Task registry — the single lookup the rest of the app uses.
 *
 * The registry pattern (§6) means 6–8 great tasks ship a complete game; the
 * rest are additive. Looking up by id never touches the engine, so adding a
 * task can't leak the blueprint.
 */
import type { TaskType } from '../shared/contract';
import { TASK_TYPES } from './types';

const BY_ID = new Map<string, TaskType>(TASK_TYPES.map((t) => [t.id, t]));

export function getTaskType(id: string): TaskType {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`Unknown task type: ${id}`);
  return t;
}

export function allTaskTypes(): TaskType[] {
  return TASK_TYPES;
}

/** Safe lookup — returns undefined for an unknown id (used by the router, whose
 *  free-text dispatch decision may not map to a real task). */
export function findTaskType(id: string): TaskType | undefined {
  return BY_ID.get(id);
}

export function taskIds(): string[] {
  return TASK_TYPES.map((t) => t.id);
}
