/**
 * registry.ts tests — the task lookup the whole app depends on.
 *
 * getTaskType must resolve every shipped id; findTaskType must tolerate the
 * router's free-text dispatch; the counts must match the shipped task types.
 */
import { describe, expect, it } from 'vitest';
import { getTaskType, findTaskType, allTaskTypes, taskIds } from './registry';

describe('task registry', () => {
  it('allTaskTypes returns the shipped set', () => {
    const ids = allTaskTypes().map((t) => t.id);
    expect(ids.length).toBeGreaterThanOrEqual(17);
    expect(ids).toContain('label-parse');
    expect(ids).toContain('damage-assessment');
    expect(ids).toContain('handwritten-label');
  });

  it('every task has the required fields', () => {
    for (const t of allTaskTypes()) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(['vision', 'document', 'text', 'video']).toContain(t.modality);
      expect([1, 2, 3]).toContain(t.difficulty);
      expect(t.outputSchema).toBeDefined();
      expect(typeof t.grade).toBe('function');
    }
  });

  it('getTaskType resolves a known id', () => {
    const t = getTaskType('hazmat-detection');
    expect(t.id).toBe('hazmat-detection');
    expect(t.label).toBe('Hazmat Check');
  });

  it('getTaskType throws on an unknown id', () => {
    expect(() => getTaskType('nope')).toThrow(/Unknown task type/);
  });

  it('findTaskType returns undefined for unknown (no throw)', () => {
    expect(findTaskType('nope')).toBeUndefined();
  });

  it('findTaskType matches by exact id only (strict); tolerant matching is the router job', () => {
    // findTaskType is the strict lookup the registry exposes.
    expect(findTaskType('damage-assessment')?.id).toBe('damage-assessment');
    // free-text/label dispatch is handled by the pipeline's resolveTask, not here.
    expect(findTaskType('Damage Assessment')).toBeUndefined();
  });

  it('taskIds mirrors allTaskTypes', () => {
    expect(taskIds().length).toBe(allTaskTypes().length);
    expect(new Set(taskIds()).size).toBe(taskIds().length); // unique
  });
});
