/**
 * Orchestrator policy + trace tests.
 *
 * shouldRetry / shouldEscalate encode the retry/escalate/accept policy (§5) —
 * the per-item control flow the coordination graph depends on. summarizeTrace
 * turns a CoordinationTrace into the human readout shown in the post-round panel.
 */
import { describe, expect, it } from 'vitest';
import { shouldRetry, shouldEscalate, roiSavedFor, MANUAL_MINUTES_PER_ITEM, COST_PER_MANUAL_MINUTE_GBP } from './policy';
import { summarizeTrace } from './trace';
import type { CoordinationTrace, TaskScenario, TaskType } from '../shared/contract';
import { getTaskType } from '../tasks/registry';

const task = getTaskType('hazmat-detection') as TaskType;
const scenario = { id: 'hz-2', taskTypeId: 'hazmat-detection', difficulty: 3, adversarial: true } as TaskScenario;

describe('shouldRetry', () => {
  it('retries on a checker fail, within the single allowed attempt', () => {
    expect(
      shouldRetry({ scenario, task, checker: { pass: false, confidence: 0.3, reasons: ['x'] }, attempts: 1 }),
    ).toBe(true);
  });

  it('does not retry past one attempt', () => {
    expect(
      shouldRetry({ scenario, task, checker: { pass: false, confidence: 0.3, reasons: ['x'] }, attempts: 2 }),
    ).toBe(false);
  });

  it('does not retry when the checker passed', () => {
    expect(
      shouldRetry({ scenario, task, checker: { pass: true, confidence: 0.95, reasons: [] }, attempts: 1 }),
    ).toBe(false);
  });

  it('does not retry when there is no checker verdict', () => {
    expect(shouldRetry({ scenario, task, checker: null, attempts: 1 })).toBe(false);
  });
});

describe('shouldEscalate', () => {
  it('escalates high-stakes (adversarial) items', () => {
    expect(shouldEscalate({ scenario, task, checker: { pass: true, confidence: 0.99, reasons: [] }, attempts: 1 })).toBe(true);
  });

  it('does NOT escalate a clean high-difficulty pass (difficulty alone is not high-stakes)', () => {
    // A routine difficulty-3 item the Verifier passed with confidence clears
    // without the specialist — escalation tracks real exceptions, not volume.
    const hardTask = getTaskType('handwritten-label') as TaskType;
    const hardScenario = { id: 'hw', taskTypeId: 'handwritten-label', difficulty: 3 } as TaskScenario;
    expect(shouldEscalate({ scenario: hardScenario, task: hardTask, checker: { pass: true, confidence: 0.9, reasons: [] }, attempts: 1 })).toBe(false);
  });

  it('escalates a checker fail even on a single attempt', () => {
    const easyTask = getTaskType('label-parse') as TaskType;
    const easyScenario = { id: 'lp', taskTypeId: 'label-parse', difficulty: 1 } as TaskScenario;
    expect(
      shouldEscalate({ scenario: easyScenario, task: easyTask, checker: { pass: false, confidence: 0.8, reasons: ['x'] }, attempts: 1 }),
    ).toBe(true);
  });

  it('escalates low-confidence checker results', () => {
    const easyTask = getTaskType('label-parse') as TaskType;
    const easyScenario = { id: 'lp', taskTypeId: 'label-parse', difficulty: 1 } as TaskScenario;
    expect(
      shouldEscalate({ scenario: easyScenario, task: easyTask, checker: { pass: true, confidence: 0.4, reasons: [] }, attempts: 1 }),
    ).toBe(true);
  });

  it('escalates on two-time checker failure', () => {
    const easyTask = getTaskType('label-parse') as TaskType;
    const easyScenario = { id: 'lp', taskTypeId: 'label-parse', difficulty: 1 } as TaskScenario;
    expect(
      shouldEscalate({ scenario: easyScenario, task: easyTask, checker: { pass: false, confidence: 0.5, reasons: ['x'] }, attempts: 2 }),
    ).toBe(true);
  });

  it('does not escalate a clean low-difficulty pass', () => {
    const easyTask = getTaskType('label-parse') as TaskType;
    const easyScenario = { id: 'lp', taskTypeId: 'label-parse', difficulty: 1 } as TaskScenario;
    expect(
      shouldEscalate({ scenario: easyScenario, task: easyTask, checker: { pass: true, confidence: 0.9, reasons: [] }, attempts: 1 }),
    ).toBe(false);
  });
});

describe('roiSavedFor', () => {
  it('computes saved GBP from manual minutes × cost', () => {
    // 10 cleared × 4 min × £0.40 = £16
    expect(roiSavedFor(10)).toBe(10 * MANUAL_MINUTES_PER_ITEM * COST_PER_MANUAL_MINUTE_GBP);
  });
  it('is zero for nothing cleared', () => {
    expect(roiSavedFor(0)).toBe(0);
  });
});

describe('summarizeTrace', () => {
  it('renders steps, retries, escalation, caught, and verdict', () => {
    const trace: CoordinationTrace = {
      steps: [
        { id: 'route', label: 'Route', status: 'done' },
        { id: 'work', label: 'Work', status: 'done' },
        { id: 'check', label: 'Check', status: 'fail' },
        { id: 'decide', label: 'Decide', status: 'done' },
      ],
      retries: 1,
      escalated: true,
      caught: 2,
      verdict: 'refuse',
      finalOutput: {},
    };
    const s = summarizeTrace(trace);
    expect(s).toContain('Route ✓');
    expect(s).toContain('Check ✗');
    expect(s).toContain('1 retry');
    expect(s).toContain('escalated');
    expect(s).toContain('checker caught 2');
    expect(s).toContain('verdict: Refuse');
  });

  it('omits optional segments when absent', () => {
    const trace: CoordinationTrace = {
      steps: [{ id: 'work', label: 'Work', status: 'done' }],
      retries: 0,
      escalated: false,
      caught: 0,
      verdict: 'accept',
      finalOutput: {},
    };
    const s = summarizeTrace(trace);
    expect(s).not.toContain('retry');
    expect(s).not.toContain('escalated');
    expect(s).toContain('verdict: Accept');
  });
});
