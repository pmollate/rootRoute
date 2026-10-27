import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGmailMessage } from '../../src/modules/intake/mailbox.js';

const DIR = fileURLToPath(new URL('../../../tests/fixtures/emails/', import.meta.url));

describe('fixtures as Gmail returns them', () => {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.eml')).sort()) {
    it(`fixture ${f} keeps sender and arrival time`, () => {
      const eml = readFileSync(DIR + f, 'utf8');
      const gold = JSON.parse(readFileSync(DIR + f.replace('.eml', '.json'), 'utf8')) as { from: string; received_at: string; message_id: string };
      const [head, ...rest] = eml.split('\n\n');
      const headers = head.split('\n').map((l) => { const i = l.indexOf(': '); return { name: l.slice(0, i), value: l.slice(i + 2) }; });
      const date = Date.parse(headers.find((h) => h.name === 'Date')!.value);
      const type = headers.find((h) => h.name === 'Content-Type')!.value.split(';')[0];
      const parsed = parseGmailMessage({ id: f, threadId: f, internalDate: String(date),
        payload: { mimeType: type, headers, body: { data: Buffer.from(rest.join('\n\n')).toString('base64url') } } });
      expect(parsed).toMatchObject({ from: gold.from, receivedAt: gold.received_at, messageId: gold.message_id });
    });
  }
});
