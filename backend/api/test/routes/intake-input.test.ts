import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { config } from '../../src/core/config.js';
import { pool, query } from '../../src/core/db/pool.js';
import { setDeps } from '../../src/modules/intake/deps.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

// REQ-INT-16: bad input to the paste endpoint is refused with a readable message per field; nothing is stored and no AI
// service is called. The messages are what the paste form shows (frontend IntakeScreen).
describe.skipIf(!hasDb)('POST /api/intake/email: bad input (needs test database)', () => {
  let app: FastifyInstance;
  const good = { from: 'orders@client190.example', subject: '[SYNTHETIC] Order', body: 'Please send 10 x HX-220.',
    receivedAt: '2026-10-21 08:05' };
  const send = (payload: unknown, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url: '/api/intake/email',
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    headers: { 'x-api-key': 'test-key', 'content-type': 'application/json', ...headers } });
  const stored = async () => Number((await query<{ n: string }>('SELECT count(*) AS n FROM intake_emails'))[0].n);

  beforeAll(async () => {
    await query('TRUNCATE intake_extractions, outbound_messages, intake_emails RESTART IDENTITY CASCADE');
    setDeps({ gmail: null });
    app = await buildApp();
  });
  afterAll(() => pool.end());

  it('AC-INT-16: an empty body is 400 "The email body is empty." and nothing is stored', async () => {
    const r = await send({ ...good, body: '' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: 'The email body is empty.', fields: { body: 'The email body is empty.' } });
    expect(await stored()).toBe(0);
  });

  it('AC-INT-16: a body of only spaces, tabs and newlines counts as empty', async () => {
    const r = await send({ ...good, body: ' \n\t \r\n ' });
    expect(r.statusCode).toBe(400);
    expect(r.json().fields).toEqual({ body: 'The email body is empty.' });
    expect(await stored()).toBe(0);
  });

  it('AC-INT-17: each missing field is named in one readable message', async () => {
    const r = await send({ subject: 'x' });
    expect(r.statusCode).toBe(400);
    const j = r.json();
    expect(j.fields).toEqual({ from: 'From is missing.', body: 'The email body is missing.', receivedAt: 'Received at is missing.' });
    expect(j.error).toBe('From is missing. The email body is missing. Received at is missing.');
    expect(j.error).not.toMatch(/invalid_type|expected|\[/i); // no raw zod text
  });

  it('AC-INT-17: a subject left out is allowed (an email may have none); a subject of the wrong type is named', async () => {
    const r = await send({ ...good, subject: 42 });
    expect(r.statusCode).toBe(400);
    expect(r.json().fields).toEqual({ subject: 'Subject must be text.' });
  });

  it('AC-INT-17: a malformed From is 400 "From must be an email address…"', async () => {
    for (const from of ['not-an-email', 'a@b', 'Sam <sam@>', '@client190.example']) {
      const r = await send({ ...good, from });
      expect(r.statusCode, from).toBe(400);
      expect(r.json().fields.from, from).toBe('From must be an email address, like orders@client190.example.');
    }
    expect(await stored()).toBe(0);
  });

  it('AC-INT-17: a malformed or impossible Received at is 400 with the expected format', async () => {
    for (const receivedAt of ['21/10/2026 08:05', '2026-10-21T08:05', '2026-10-21', '2026-02-30 08:05', '2026-10-21 24:00', '2026-13-01 10:00']) {
      const r = await send({ ...good, receivedAt });
      expect(r.statusCode, receivedAt).toBe(400);
      expect(r.json().fields.receivedAt, receivedAt).toBe('Received at must look like 2026-09-14 09:30 (a real date, 24-hour time).');
    }
  });

  it('AC-INT-17: inReplyTo must be an email number', async () => {
    const r = await send({ ...good, inReplyTo: 'abc' });
    expect(r.statusCode).toBe(400);
    expect(r.json().fields).toEqual({ inReplyTo: 'In reply to must be an email number.' });
  });

  it('AC-INT-17: a JSON body that is not an object is 400 with what to send', async () => {
    for (const payload of ['[]', '"hello"', 'null']) {
      const r = await send(payload);
      expect(r.statusCode, payload).toBe(400);
      expect(r.json().error, payload).toBe('Send the email as a JSON object with from, subject, body and receivedAt.');
    }
  });

  it('AC-INT-18: a body, subject or From over its limit is 400 naming the limit; at the limit it is accepted', async () => {
    const n = config.INTAKE_MAX_BODY_CHARS;
    const long = await send({ ...good, body: 'x'.repeat(n + 1) });
    expect(long.statusCode).toBe(400);
    expect(long.json().fields).toEqual({ body: `The email body is longer than ${n.toLocaleString('en-US')} characters.` });
    const subject = await send({ ...good, subject: 's'.repeat(config.INTAKE_MAX_SUBJECT_CHARS + 1) });
    expect(subject.json().fields).toEqual(
      { subject: `The subject is longer than ${config.INTAKE_MAX_SUBJECT_CHARS.toLocaleString('en-US')} characters.` });
    const from = await send({ ...good, from: `${'a'.repeat(320)}@client190.example` });
    expect(from.json().fields).toEqual({ from: 'From is longer than 320 characters.' });
    expect(await stored()).toBe(0);
  });

  it('AC-INT-18: a request over the HTTP body limit is 413 with a readable JSON message, not Fastify\'s default', async () => {
    const r = await send({ ...good, body: 'x'.repeat(app.initialConfig.bodyLimit! + 1) });
    expect(r.statusCode).toBe(413);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.json()).toEqual({ error: 'The request is larger than 1 MB. Paste only the text of one email.', fields: {} });
    expect(await stored()).toBe(0);
  });

  it('AC-INT-18: malformed JSON and an empty JSON request are 400 with a readable message', async () => {
    for (const payload of ['{"from": "orders@client190.example", ', '']) {
      const r = await send(payload);
      expect(r.statusCode, JSON.stringify(payload)).toBe(400);
      expect(r.json(), JSON.stringify(payload)).toEqual({ error: 'The request is not valid JSON.', fields: {} });
    }
  });

  it('AC-INT-18: a request that is not JSON is 415 (unknown type) or 400 (plain text) with a readable message', async () => {
    const form = await send('from=x', { 'content-type': 'application/x-www-form-urlencoded' });
    expect(form.statusCode).toBe(415);
    expect(form.json()).toEqual({ error: 'Send the request as JSON (Content-Type: application/json).', fields: {} });
    const text = await send('Please send 10 x HX-220.', { 'content-type': 'text/plain' });
    expect(text.statusCode).toBe(400);
    expect(text.json().error).toBe('Send the email as a JSON object with from, subject, body and receivedAt.');
  });

  it('AC-INT-17: the limits the form shows come from GET /api/intake', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/intake' })).json();
    expect(list.limits).toEqual({ bodyChars: config.INTAKE_MAX_BODY_CHARS, subjectChars: config.INTAKE_MAX_SUBJECT_CHARS, fromChars: 320 });
  });

  it('AC-INT-16: a valid email with surrounding whitespace is still processed (the body is not rewritten)', async () => {
    const r = await send({ ...good, body: `\n  ${good.body}  \n` });
    expect(r.statusCode).toBe(200);
    const id = r.json().id as number;
    const row = (await query<{ body: string }>('SELECT body FROM intake_emails WHERE id = $1', [id]))[0];
    expect(row.body).toBe(`\n  ${good.body}  \n`);
  });

  it('readable messages on the action and fetch bodies too', async () => {
    const act = await app.inject({ method: 'POST', url: '/api/intake/1/action', payload: { action: 'launch' }, headers: { 'x-api-key': 'test-key' } });
    expect(act.statusCode).toBe(400);
    expect(act.json().fields).toEqual({ action: 'Unknown action.' });
    const fetch = await app.inject({ method: 'POST', url: '/api/intake/fetch', payload: { max: 0 }, headers: { 'x-api-key': 'test-key' } });
    expect(fetch.statusCode).toBe(400);
    expect(fetch.json().fields.max).toMatch(/^Max must be a whole number from 1 to \d+\.$/);
  });
});
