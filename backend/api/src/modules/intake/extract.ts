import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type LLM, LLMError } from '../../core/llm/types.js';
import { type Extraction, ExtractionSchema } from './schema.js';

export const EXTRACT_SYSTEM = readFileSync(fileURLToPath(new URL('./prompts/extract.md', import.meta.url)), 'utf8');

export function extractUserPrompt(subject: string, body: string): string {
  return `<email>\nSubject: ${subject}\n\n${body}\n</email>`;
}

/**
 * E3, REQ-INT-01: one retry on invalid output; null (-> MISSING_INFO) on a second failure or a refusal.
 * A transport error is thrown: the email waits and is retried, rather than asking the client for what they sent.
 * Pass only redacted text (see read.ts).
 */
export async function extractOrder(llm: LLM, subject: string, body: string): Promise<Extraction | null> {
  const req = { system: EXTRACT_SYSTEM, user: extractUserPrompt(subject, body), schema: ExtractionSchema };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await llm.json(req);
    } catch (err) {
      if (!(err instanceof LLMError) || (err.kind !== 'invalid' && err.kind !== 'refusal')) throw err;
      if (err.kind === 'refusal') return null;
    }
  }
  return null;
}
