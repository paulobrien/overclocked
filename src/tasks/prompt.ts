/**
 * Shared prompt-assembly helpers.
 *
 * Most of buildMessages is identical across every task — only the schema and
 * system prompt differ. This is the "createAgent factory" plumbing from §5:
 * a new task is just a config object, not bespoke code.
 */
import { z } from 'zod';
import type { ChatMessages, ContentPart, TaskScenario } from '../shared/contract';
import { toDataUrl } from '../agents/image';

/** Render a Zod schema into a terse JSON-shape instruction for the prompt. */
export function schemaToInstruction(schema: z.ZodType<any>): string {
  // Zod doesn't expose a clean "describe shape" API, so we read the def tree.
  return `Respond with ONLY a JSON object matching this TypeScript shape (no prose, no markdown fences):\n${describeZod(schema)}`;
}

function describeZod(schema: z.ZodType<any>, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (schema instanceof z.ZodObject) {
    const shape = (schema as z.ZodObject<any>).shape as Record<string, z.ZodType<any>>;
    const lines = Object.entries(shape).map(([k, v]) => {
      const opt = v instanceof z.ZodOptional || v instanceof z.ZodNullable;
      const inner =
        v instanceof z.ZodOptional ? (v as any).unwrap() : v instanceof z.ZodNullable ? (v as any).unwrap() : v;
      const enumPart =
        inner instanceof z.ZodEnum ? `: ${JSON.stringify((inner as z.ZodEnum<any>).options)}` : `: ${describeZod(inner, indent + 1)}`;
      // Surface a field's `.describe(...)` text as an inline comment so the model
      // gets per-field guidance (what the field means / when it's true), not just
      // a bare type. This is how an ambiguous field (e.g. hazmat `compliant`) is
      // disambiguated without bespoke per-task prompt code.
      const desc = (v as { description?: string }).description ?? (inner as { description?: string }).description;
      return `${pad}  ${k}${opt ? '?' : ''}${enumPart}${desc ? `  // ${desc}` : ''}`;
    });
    return `{\n${lines.join('\n')}\n${pad}}`;
  }
  if (schema instanceof z.ZodArray) return `${describeZod((schema as z.ZodArray<any>).element)}[]`;
  if (schema instanceof z.ZodEnum) return JSON.stringify((schema as z.ZodEnum<any>).options);
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  return 'string';
}

/** A standard system prompt: role + strict "return only this JSON". */
export function systemPrompt(role: string, schema: z.ZodType<any>): string {
  return [
    `You are a ${role} on an enterprise warehouse sortation line.`,
    `Read the incoming parcel/manifest and resolve the fulfillment exception precisely.`,
    schemaToInstruction(schema),
    `Booleans must be true/false. Numbers must be JSON numbers. Be terse and exact.`,
  ].join('\n');
}

/** Assemble the user message, attaching the image as a model-consumable data URL.
 *  Async because vision images are fetched + base64-encoded before sending (the
 *  model can't consume a relative asset path). */
export async function buildUserMessage(scenario: TaskScenario): Promise<ChatMessages[number]> {
  const textParts: string[] = [];
  if (scenario.input.text) textParts.push(scenario.input.text);
  if (scenario.input.documents?.length) {
    textParts.push(...scenario.input.documents.map((d, i) => `--- Document ${i + 1} ---\n${d}`));
  }
  // Video modality: an ordered sequence of still frames. Interleave a "Frame k
  // of N" caption before each image so the model reads them as time-ordered
  // (this is exactly how a video LLM samples a clip — Cerebras ingests only
  // text + images, so every lane gets the same sampled frames). The frames are
  // converted to data URLs first (a relative path isn't a valid image_url).
  if (scenario.input.frames?.length) {
    const frames = scenario.input.frames;
    const intro =
      textParts.join('\n\n') ||
      'Frames sampled in time order from the sortation line camera. Watch what happens to the parcel across them.';
    const content: ContentPart[] = [{ type: 'text', text: intro }];
    for (let i = 0; i < frames.length; i++) {
      const url = await toDataUrl(frames[i]);
      content.push({ type: 'text', text: `Frame ${i + 1} of ${frames.length}:` });
      content.push({ type: 'image_url', image_url: { url } });
    }
    return { role: 'user', content };
  }
  if (scenario.input.imageUrl) {
    const url = await toDataUrl(scenario.input.imageUrl);
    return {
      role: 'user',
      content: [
        { type: 'text', text: textParts.join('\n\n') || 'Resolve this parcel exception.' },
        { type: 'image_url', image_url: { url } },
      ],
    };
  }
  return { role: 'user', content: textParts.join('\n\n') || 'Resolve this parcel exception.' };
}
