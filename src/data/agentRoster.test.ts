/**
 * Agent roster + human-controls tests.
 *
 * These guard the two user-facing surfaces added in this pass:
 *  - the roster data (the multi-agent story shown to judges) must match the
 *    implemented AgentRole union and cover every pipeline step, and
 *  - every shipped task must declare humanControls whose keys line up with its
 *    focusFields (so the "I Wanna Play" overlay can render real inputs — the
 *    prior Zod-internals approach was broken on Zod v4).
 */
import { describe, expect, it } from 'vitest';
import { AGENT_ROSTER, rosterEntry } from './agentRoster';
import type { AgentRole } from '../agents/createAgent';
import { allTaskTypes } from '../tasks/registry';

const IMPLEMENTED_ROLES: AgentRole[] = ['router', 'worker', 'checker', 'escalation', 'orchestrator'];

describe('AGENT_ROSTER data integrity', () => {
  it('covers every implemented agent role', () => {
    const roles = AGENT_ROSTER.map((e) => e.role);
    for (const r of IMPLEMENTED_ROLES) {
      expect(roles, `missing roster entry for ${r}`).toContain(r);
    }
  });

  it('every entry maps to a valid pipeline step', () => {
    for (const e of AGENT_ROSTER) {
      expect(['route', 'work', 'check', 'decide'], `${e.role} bad step`).toContain(e.stepId);
    }
  });

  it('every entry has non-empty name/job/why', () => {
    for (const e of AGENT_ROSTER) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.job.length).toBeGreaterThan(10);
      expect(e.why.length).toBeGreaterThan(10);
      expect(e.icon.length).toBeGreaterThan(0);
    }
  });

  it('covers all four pipeline steps the focus card renders', () => {
    const steps = new Set(AGENT_ROSTER.map((e) => e.stepId));
    expect(steps.has('route')).toBe(true);
    expect(steps.has('work')).toBe(true);
    expect(steps.has('check')).toBe(true);
    expect(steps.has('decide')).toBe(true);
  });

  it('rosterEntry() looks up by role', () => {
    expect(rosterEntry('worker')?.name).toBe('Worker');
    expect(rosterEntry('orchestrator')?.role).toBe('orchestrator');
    expect(rosterEntry('nope' as AgentRole)).toBeUndefined();
  });
});

describe('humanControls per task (the "I Wanna Play" overlay inputs)', () => {
  it('every shipped task declares humanControls', () => {
    for (const t of allTaskTypes()) {
      expect(t.humanControls, `${t.id} missing humanControls`).toBeDefined();
      expect(t.humanControls!.length, `${t.id} has no controls`).toBeGreaterThan(0);
    }
  });

  it('every control key matches a focusField (so overlay + focus card agree)', () => {
    for (const t of allTaskTypes()) {
      const focusKeys = new Set((t.focusFields ?? []).map((f) => f.key));
      for (const c of t.humanControls ?? []) {
        expect(focusKeys.has(c.key), `${t.id}: control key "${c.key}" not in focusFields`).toBe(true);
      }
    }
  });

  it('enum controls always carry options', () => {
    for (const t of allTaskTypes()) {
      for (const c of t.humanControls ?? []) {
        if (c.kind === 'enum') {
          expect(c.options, `${t.id}.${c.key} enum has no options`).toBeDefined();
          expect(c.options!.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('kinds are one of the renderable set', () => {
    for (const t of allTaskTypes()) {
      for (const c of t.humanControls ?? []) {
        expect(['enum', 'boolean', 'number', 'text'], `${t.id}.${c.key} bad kind`).toContain(c.kind);
      }
    }
  });
});
