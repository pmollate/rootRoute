import { PII_CATEGORIES, type PiiCategory, type PiiDetector, type PiiEntity, PiiError } from './types.js';

const API_VERSION = '2024-11-01';
const MAX_CHARS = 5000; // the synchronous API takes up to 5,120 characters per document

interface AnalyzeResponse {
  results?: {
    documents?: { entities: { text: string; category: string; offset: number; length: number }[] }[];
    errors?: { error?: { message?: string } }[];
  };
}

/** Splits text into pieces of at most `max` characters, at line breaks where possible. Returns [start, piece]. */
export function chunks(text: string, max: number): [number, string][] {
  const out: [number, string][] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > start) end = nl + 1;
    }
    out.push([start, text.slice(start, end)]);
    start = end;
  }
  return out;
}

/** PII detection in Azure AI Language (Foundry Tools). Asks only for PII_CATEGORIES, so addresses stay in the text. */
export class AzureLanguagePii implements PiiDetector {
  readonly name = 'azure-language';
  private readonly url: string;

  constructor(endpoint: string, private readonly key: string, private readonly fetchFn: typeof fetch = fetch) {
    this.url = `${endpoint.replace(/\/+$/, '')}/language/:analyze-text?api-version=${API_VERSION}`;
  }

  async detect(text: string): Promise<PiiEntity[]> {
    const found: PiiEntity[] = [];
    for (const [start, piece] of chunks(text, MAX_CHARS)) {
      for (const e of await this.call(piece)) found.push({ ...e, offset: e.offset + start });
    }
    return found;
  }

  private async call(text: string): Promise<PiiEntity[]> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': this.key, 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'PiiEntityRecognition',
          parameters: { modelVersion: 'latest', piiCategories: PII_CATEGORIES, stringIndexType: 'Utf16CodeUnit', loggingOptOut: true },
          analysisInput: { documents: [{ id: '1', language: 'en', text }] },
        }),
      });
    } catch (err) {
      throw new PiiError(err instanceof Error ? err.message : String(err), 'transport');
    }
    if (!res.ok) throw new PiiError(`Azure Language returned ${res.status}: ${await res.text()}`, 'transport');
    const body = (await res.json()) as AnalyzeResponse;
    const doc = body.results?.documents?.[0];
    if (!doc) throw new PiiError(body.results?.errors?.[0]?.error?.message ?? 'Azure Language returned no result', 'transport');
    return doc.entities
      .filter((e) => (PII_CATEGORIES as readonly string[]).includes(e.category))
      .map((e) => ({ category: e.category as PiiCategory, offset: e.offset, length: e.length, text: e.text }));
  }
}
