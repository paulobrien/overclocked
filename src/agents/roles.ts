/**
 * Role agents shared across all task types (§5 roster).
 *
 * - Router:   classifies the incoming item + modality, dispatches to a worker.
 * - Checker:  independently reviews the worker's output, can bounce for retry.
 * - Escalation: heavier second-look for low-confidence / high-stakes items.
 *
 * These are constructed with createAgent() like everything else — a config
 * object each. They take the scenario + a candidate output as input.
 */
import { createAgent, type Agent } from './createAgent';
import { RouterSchema, CheckerSchema, EscalationSchema, type RouterDecision, type CheckerVerdict, type EscalationDecision } from '../tasks/schemas';
import { schemaToInstruction } from '../tasks/prompt';
import { toDataUrl } from './image';
import type { ContentPart, TaskScenario } from '../shared/contract';

export type RouterAgent = Agent<TaskScenario, RouterDecision>;
export type CheckerAgent = Agent<{ scenario: TaskScenario; workerOutput: unknown }, CheckerVerdict>;
export type EscalationAgent = Agent<{ scenario: TaskScenario; workerOutput: unknown; checkerNotes: string[] }, EscalationDecision>;

export function makeRouter(): RouterAgent {
  return createAgent<TaskScenario, RouterDecision>({
    id: 'router',
    role: 'router',
    label: 'Router',
    modality: 'vision',
    outputSchema: RouterSchema,
    systemPrompt: [
      'You are the Intake Router on a warehouse sortation line.',
      'Read the incoming parcel/manifest and classify the exception type and modality.',
      'Identify which of these task types it is:',
      'label-parse, damage-assessment, hazmat-detection, customs-invoice, seal-tamper, manifest-recon, tariff-classification, exception-routing.',
      schemaToInstruction(RouterSchema),
    ].join('\n'),
    buildMessages: (s) => [
      { role: 'user', content: s.input.text ?? `Classify this parcel exception. Image present: ${!!s.input.imageUrl}` },
    ],
  });
}

export function makeChecker(): CheckerAgent {
  return createAgent<{ scenario: TaskScenario; workerOutput: unknown }, CheckerVerdict>({
    id: 'checker',
    role: 'checker',
    label: 'Verifier',
    modality: 'vision',
    outputSchema: CheckerSchema,
    systemPrompt: [
      'You are an independent Verifier on a warehouse sortation line.',
      "Review the worker agent's structured output against the source — the text",
      'AND the attached image or frame sequence when present.',
      schemaToInstruction(CheckerSchema),
      'Default to pass=true. Set pass=false ONLY when you can point to a specific,',
      'concrete mismatch you can actually see in the source/image (a wrong code, a',
      'value that contradicts the evidence). Uncertainty, or "plausible but I am not',
      'sure", is NOT grounds to fail. confidence is your 0..1 certainty.',
    ].join('\n'),
    // The Verifier gets the IMAGE too on vision tasks — and the FRAME SEQUENCE on
    // video tasks — without it, it can't actually check the worker's visual/motion
    // extraction and just guesses (which surfaced as a ~76% false-alarm rate on
    // vision in live testing, and re-appears on the video task if frames are
    // dropped — the blind Verifier over-flags and inflates caught/escalated).
    buildMessages: async ({ scenario, workerOutput }) => {
      const text = `Source:\n${scenario.input.text ?? '(see image)'}\n\nWorker output to verify:\n${JSON.stringify(workerOutput, null, 2)}`;
      if (scenario.input.frames?.length) {
        const content: ContentPart[] = [{ type: 'text', text }];
        for (let i = 0; i < scenario.input.frames.length; i++) {
          const url = await toDataUrl(scenario.input.frames[i]);
          content.push({ type: 'text', text: `Frame ${i + 1} of ${scenario.input.frames.length}:` });
          content.push({ type: 'image_url', image_url: { url } });
        }
        return [{ role: 'user', content }];
      }
      if (scenario.input.imageUrl) {
        const url = await toDataUrl(scenario.input.imageUrl);
        return [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url } }] }];
      }
      return [{ role: 'user', content: text }];
    },
  });
}

export function makeEscalation(): EscalationAgent {
  return createAgent<{ scenario: TaskScenario; workerOutput: unknown; checkerNotes: string[] }, EscalationDecision>({
    id: 'escalation',
    role: 'escalation',
    label: 'Exceptions Specialist',
    modality: 'vision',
    outputSchema: EscalationSchema,
    systemPrompt: [
      'You are the Exceptions Specialist — a senior agent invoked for high-stakes or low-confidence items.',
      'Customs holds, hazmat, high-value, suspected tamper: you make the final call.',
      schemaToInstruction(EscalationSchema),
      'Default to RELEASE. Only hold or refuse when there is a clear, specific',
      'compliance or safety reason in the evidence — do not override a sound',
      'worker decision just because the item is high-stakes.',
    ].join('\n'),
    buildMessages: ({ scenario, workerOutput, checkerNotes }) => [
      {
        role: 'user',
        content: `Source:\n${scenario.input.text ?? '(image only)'}\n\nWorker output:\n${JSON.stringify(workerOutput, null, 2)}\n\nVerifier notes: ${checkerNotes.join('; ') || '(none)'}`,
      },
    ],
  });
}

/** Singleton-ish instances — role configs are stateless, so one each is fine. */
export const routerAgent = makeRouter();
export const checkerAgent = makeChecker();
export const escalationAgent = makeEscalation();
