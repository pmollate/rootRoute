import { describe, expect, it } from 'vitest';
import type { LLM } from '../../src/core/llm/types.js';
import { restore } from '../../src/core/pii/redact.js';
import { draftReply, formatDate, type ReplyFacts, requiredPhrases, templateReply } from '../../src/modules/intake/reply.js';
import { checkPromise } from '../../src/modules/warehouse/domain.js';

const C190_SAVED = [
  { id: 1, client_id: 'C190', label: 'Main DC', line1: '4411 Mill Rd', line2: 'Dock 1', city: 'Atlanta', state: 'GA', zip: '30303' },
  { id: 2, client_id: 'C190', label: 'Riverside store', line1: '87 Depot Ave', line2: 'Dock 2', city: 'Orlando', state: 'FL', zip: '32801' },
];
const base: ReplyFacts = {
  decision: 'ALL_CLEAR', clientName: 'Client 190', contact: null, items: [{ sku: 'HX-616', qty: 45 }],
  promise: checkPromise('standard', '2026-10-21 16:51'), missing: [], candidates: [],
  address: null, addressIssues: [], suggestion: null,
};
const llmSaying = (text: string): LLM => ({ name: 'fake', json: async () => { throw new Error('unused'); }, text: async () => text });

describe('reply drafting', () => {
  it('formats dates as 25 Oct 2026', () => {
    expect(formatDate('2026-10-25')).toBe('25 Oct 2026');
  });

  it('AC-INT-03: a same-day request at 09:15 promises next day and says why', () => {
    const text = templateReply({ ...base, promise: checkPromise('same_day', '2026-10-26 09:15') });
    expect(text).toContain('28 Oct 2026');
    expect(text).toContain('after the 08:00 pick-list cut-off');
  });

  it('AC-INT-06: CONFIRM_ADDRESS offers both saved addresses and names the missing fields', () => {
    const text = templateReply({ ...base, decision: 'CONFIRM_ADDRESS', missing: ['address.line1', 'address.zip'], candidates: C190_SAVED });
    expect(text).toContain('street address, ZIP code');
    expect(text).toContain('Main DC: 4411 Mill Rd');
    expect(text).toContain('Riverside store: 87 Depot Ave');
  });

  it('says what the map found wrong with a complete address, and the map ZIP', () => {
    const text = templateReply({ ...base, decision: 'CONFIRM_ADDRESS', candidates: C190_SAVED,
      address: '9800 International Dr, Dock 3, Orlando, FL 19107', addressIssues: ['zip_mismatch'],
      suggestion: { line1: '9800 International Dr', city: 'Orlando', state: 'FL', zip: '32819' } });
    expect(text).toContain('9800 International Dr, Dock 3, Orlando, FL 19107');
    expect(text).toContain('ZIP code 19107 does not match Orlando, FL');
    expect(text).toContain('32819');
    expect(text).toContain('Main DC: 4411 Mill Rd');
  });

  it('says which city the map puts the street in, and that city is required text', () => {
    const facts = { ...base, decision: 'CONFIRM_ADDRESS' as const, address: '65156 Powers Rd, Madhapur, OR 97828',
      addressIssues: ['city_mismatch' as const], suggestion: { line1: '65156 Powers Rd', city: 'Enterprise', state: 'OR', zip: '97828' } };
    const text = templateReply(facts);
    expect(text).toContain('The map places 65156 Powers Rd, OR 97828 in Enterprise, not Madhapur.');
    expect(requiredPhrases(facts)).toEqual(expect.arrayContaining(['city', 'Enterprise']));
  });

  it('asks for the street when the map cannot find it, without guessing one', () => {
    const text = templateReply({ ...base, decision: 'CONFIRM_ADDRESS', address: '2009 Quillfeather Ln, Orlando, FL 32801',
      addressIssues: ['street_not_found'] });
    expect(text).toContain('could not find 2009 Quillfeather Ln in Orlando, FL');
    expect(text).toContain('street address');
  });

  it('greets the contact by tag; the name goes back only after approval (restore)', () => {
    const text = templateReply({ ...base, contact: '[PERSON_1]' });
    expect(text.startsWith('Hello [PERSON_1],')).toBe(true);
    expect(restore(text, { '[PERSON_1]': 'Dana Whitfield' }).startsWith('Hello Dana Whitfield,')).toBe(true);
  });

  it('keeps a model draft that contains every required phrase', async () => {
    const out = await draftReply(llmSaying('Confirmed, delivery by 25 Oct 2026. Halcyon Logistics'), base);
    expect(out.source).toBe('model');
  });

  it('falls back to the template when the model drops the promise date', async () => {
    const out = await draftReply(llmSaying('Confirmed, delivery soon.'), base);
    expect(out).toMatchObject({ source: 'template' });
    expect(out.text).toContain('25 Oct 2026');
  });

  it('falls back to the template when the model is unavailable', async () => {
    const down: LLM = { name: 'down', json: async () => { throw new Error('x'); }, text: async () => { throw new Error('timeout'); } };
    expect(await draftReply(down, base)).toMatchObject({ source: 'template' });
  });
});
