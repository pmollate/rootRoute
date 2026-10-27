import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AzureLanguagePii, chunks } from '../src/core/pii/azureLanguage.js';
import { RecordedPii, RecordingPii } from '../src/core/pii/recorded.js';
import { applyRedaction, restore } from '../src/core/pii/redact.js';
import type { PiiDetector, PiiEntity } from '../src/core/pii/types.js';

const EMAIL = 'Ship to:\n90 W Broad St\nColumbus, OH 43215\n\nThanks,\nDana Whitfield\n(614) 555-0142\ndana.whitfield@client012.example\nDana Whitfield';
const at = (category: PiiEntity['category'], text: string, from = 0): PiiEntity =>
  ({ category, text, offset: EMAIL.indexOf(text, from), length: text.length });
const ENTITIES = [at('Person', 'Dana Whitfield'), at('PhoneNumber', '(614) 555-0142'),
  at('Email', 'dana.whitfield@client012.example'), at('Person', 'Dana Whitfield', EMAIL.indexOf('example'))];

describe('PII redaction', () => {
  it('replaces people, phones and emails with tags and keeps the address', () => {
    const r = applyRedaction(EMAIL, ENTITIES);
    expect(r.text).toContain('90 W Broad St\nColumbus, OH 43215');
    expect(r.text).toContain('[PERSON_1]\n[PHONE_1]\n[EMAIL_1]\n[PERSON_1]');
    expect(r.text).not.toMatch(/Dana|555-0142|client012/);
    expect(restore(r.text, r.replacements)).toBe(EMAIL);
  });

  it('still removes an entity whose offset does not line up (fails closed)', () => {
    const r = applyRedaction(EMAIL, [{ ...at('Person', 'Dana Whitfield'), offset: 3 }]);
    expect(r.text).not.toContain('Dana Whitfield');
  });

  it('splits long text at line breaks without losing characters', () => {
    const text = 'line\n'.repeat(3000);
    const parts = chunks(text, 5000);
    expect(parts.map(([, p]) => p).join('')).toBe(text);
    expect(parts.every(([start, p]) => p.length <= 5000 && text.startsWith(p, start))).toBe(true);
  });
});

describe('Azure Language PII', () => {
  it('asks only for person, phone and email, with UTF-16 offsets', async () => {
    const sent: { url: string; body: { parameters?: unknown } }[] = [];
    const fetch = async (url: unknown, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      const entities = [{ text: 'Dana Whitfield', category: 'Person', offset: 3, length: 14, confidenceScore: 0.98 },
        { text: '90 W Broad St', category: 'Address', offset: 30, length: 13, confidenceScore: 0.9 }];
      return new Response(JSON.stringify({ results: { documents: [{ id: '1', entities, warnings: [] }], errors: [] } }), { status: 200 });
    };
    const found = await new AzureLanguagePii('https://x.cognitiveservices.azure.com/', 'key', fetch).detect('Hi Dana Whitfield');
    expect(sent[0].url).toBe('https://x.cognitiveservices.azure.com/language/:analyze-text?api-version=2024-11-01');
    expect(sent[0].body.parameters).toMatchObject({ piiCategories: ['Person', 'PhoneNumber', 'Email'], stringIndexType: 'Utf16CodeUnit' });
    expect(found).toEqual([{ category: 'Person', text: 'Dana Whitfield', offset: 3, length: 14 }]);
  });

  it('turns an HTTP error into a transport error', async () => {
    const fetch = async () => new Response('denied', { status: 401 });
    await expect(new AzureLanguagePii('https://x', 'bad', fetch).detect('hi')).rejects.toMatchObject({ kind: 'transport' });
  });

  it('replays what RecordingPii saved', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rec-'));
    const fake: PiiDetector = { name: 'fake', detect: async () => ENTITIES };
    await new RecordingPii(fake, dir).detect(EMAIL);
    expect(await new RecordedPii(dir).detect(EMAIL)).toEqual(ENTITIES);
    await expect(new RecordedPii(dir).detect('other')).rejects.toMatchObject({ kind: 'missing_recording' });
  });
});
