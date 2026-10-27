import type { z } from 'zod';

export interface TextRequest {
  system: string;
  user: string;
  /** Which step made the call (e.g. extract, reply); shown on stored completions in Azure AI Foundry. */
  tag?: string;
}

export interface JsonRequest<T> extends TextRequest {
  schema: z.ZodType<T>;
}

/** The only way the app talks to an AI model. Implementations: azure-openai, recorded. */
export interface LLM {
  readonly name: string;
  json<T>(req: JsonRequest<T>): Promise<T>;
  text(req: TextRequest): Promise<string>;
}

export type LLMErrorKind = 'refusal' | 'invalid' | 'transport' | 'missing_recording';

export class LLMError extends Error {
  constructor(message: string, readonly kind: LLMErrorKind) {
    super(message);
    this.name = 'LLMError';
  }
}

/** Parses a model's JSON reply and checks it against the schema (model output is untrusted). */
export function parseJson<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LLMError('model did not return JSON', 'invalid');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new LLMError(result.error.message, 'invalid');
  return result.data;
}
