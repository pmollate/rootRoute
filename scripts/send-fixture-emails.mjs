#!/usr/bin/env node
// Sends the synthetic fixture emails (backend/tests/fixtures/emails/NN.eml) to a running API's POST /api/intake/email,
// as the paste form does, and prints one row per email: id, expected decision, decision, status and seconds.
//
//   npm run send:fixtures                 all 50
//   npm run send:fixtures -- 01 09 34     a few, by number
//
// Environment: API_URL (default http://localhost:3001) and API_KEY (default dev-key), from the shell or the repo's .env.
// The API must run with AUTH_REQUIRED=off, which accepts x-api-key; with sign-in on, use the dashboard's paste form.
// With LLM_PROVIDER=recorded (the default) the 50 fixtures replay their recorded answers; a second run of the same
// email returns the stored decision (the API dedupes by sender and body).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = `${ROOT}backend/tests/fixtures/emails/`;

/** API_URL and API_KEY from the shell first, else the repo's .env (no other value is read, nothing is printed). */
function setting(name, fallback) {
  if (process.env[name]) return process.env[name];
  const env = `${ROOT}.env`;
  if (existsSync(env)) {
    const line = readFileSync(env, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
    const value = line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
    if (value) return value;
  }
  return fallback;
}

/** The text the Gmail reader would give (backend/api/src/modules/intake/mailbox.ts bodyText): HTML loses its tags. */
function bodyOf(head, raw) {
  if (!/^Content-Type: text\/html/mi.test(head)) return raw;
  return raw.replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function fixture(id) {
  const eml = readFileSync(`${DIR}${id}.eml`, 'utf8');
  const gold = JSON.parse(readFileSync(`${DIR}${id}.json`, 'utf8'));
  const [head, ...rest] = eml.split('\n\n');
  return {
    id, expected: gold.decision,
    // received_at is the local order time the fixture was written for (the .eml Date header in the mailbox zone).
    email: { from: gold.from, subject: /^Subject: (.*)$/m.exec(head)?.[1] ?? '', body: bodyOf(head, rest.join('\n\n')),
      receivedAt: gold.received_at },
  };
}

const apiUrl = setting('API_URL', 'http://localhost:3001').replace(/\/$/, '');
const apiKey = setting('API_KEY', 'dev-key');
const all = readdirSync(DIR).filter((f) => f.endsWith('.eml')).map((f) => f.slice(0, -4)).sort();
const wanted = process.argv.slice(2).map((a) => a.padStart(2, '0'));
const unknown = wanted.filter((id) => !all.includes(id));
if (unknown.length) {
  console.error(`No fixture ${unknown.join(', ')}: choose from ${all[0]} to ${all.at(-1)}.`);
  process.exit(2);
}
const ids = wanted.length ? wanted : all;

const rows = [];
console.log(['id '.padEnd(3), 'expected'.padEnd(16), 'decision'.padEnd(16), 'status'.padEnd(18), 'seconds'.padStart(7)].join(' '));
for (const id of ids) {
  const f = fixture(id);
  const start = performance.now();
  let decision = '-';
  let status = '-';
  let note = '';
  try {
    const res = await fetch(`${apiUrl}/api/intake/email`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify(f.email) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      decision = data.decision ?? '-';
      status = data.status ?? '-';
      note = data.reason ? data.reason : `email ${data.id}`;
    } else {
      status = `HTTP ${res.status}`;
      note = typeof data.error === 'string' ? data.error : '';
    }
  } catch (err) {
    status = 'no answer';
    note = `${apiUrl} did not answer (${err.cause?.code ?? err.message}). Is the API running (npm run dev:api)?`;
  }
  rows.push({ id, expected: f.expected, decision, status, seconds: (performance.now() - start) / 1000, note });
  const r = rows.at(-1);
  console.log([r.id.padEnd(3), r.expected.padEnd(16), r.decision.padEnd(16), r.status.padEnd(18), r.seconds.toFixed(2).padStart(7),
    (r.decision === r.expected ? '' : '  *') + (r.note ? `  ${r.note}` : '')].join(' '));
  if (status === 'no answer') break;
}

if (rows.length) {
  const decided = rows.filter((r) => r.decision !== '-');
  const secs = rows.map((r) => r.seconds).sort((a, b) => a - b);
  const pct = (p) => secs[Math.min(secs.length - 1, Math.ceil((p / 100) * secs.length) - 1)].toFixed(2);
  console.log(`\n${rows.length} sent to ${apiUrl}: ${decided.length} decided, `
    + `${rows.filter((r) => r.decision === r.expected).length} match the expected decision (* = differs). `
    + `Seconds p50 ${pct(50)}, p95 ${pct(95)}, max ${secs.at(-1).toFixed(2)}.`);
}
process.exit(rows.some((r) => r.status === 'no answer' || r.status.startsWith('HTTP')) ? 1 : 0);
