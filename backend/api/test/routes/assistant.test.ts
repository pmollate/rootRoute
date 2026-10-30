import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, query } from '../../src/core/db/pool.js';
import { RECORDINGS_DIR } from '../../src/core/recordings.js';
import { REFUSAL } from '../../src/modules/assistant/answer.js';
import { QuestionLimiter } from '../../src/modules/assistant/limit.js';
import { setAssistantDeps } from '../../src/modules/assistant/routes.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';
import { AUTH_ON, bearer } from '../token.js';

const fixture = <T>(f: string) => JSON.parse(readFileSync(new URL(`../fixtures/assistant/${f}`, import.meta.url), 'utf8')) as T;
// SPEC §4.2: every table Node writes (AC-ASK-07).
const NODE_TABLES = ['audit_log', 'intake_emails', 'intake_extractions', 'outbound_messages', 'saved_addresses', 'client_domains',
  'inbound_orders', 'recommendations', 'alerts', 'override_log', 'complaint_triage'];
const counts = async () => Object.fromEntries(await Promise.all(NODE_TABLES.map(async (t) =>
  [t, (await query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`, []))[0].n] as const)));

// The assistant's model turns are recorded against Azure OpenAI by C15 Step 11 (`npm run record:assistant`). The file
// skips, rather than fails, if no `kind: "tool"` recordings are in test/recordings/ (e.g. while they are re-recorded).
const hasRecordings = readdirSync(RECORDINGS_DIR).some((f) => f.endsWith('.json')
  && (JSON.parse(readFileSync(join(RECORDINGS_DIR, f), 'utf8')) as { kind?: string }).kind === 'tool');

describe.skipIf(!hasDb || !hasRecordings)('Ask LateLens, recorded (needs test database and tool recordings: Q-ASK-02, C15 Step 11)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ auth: AUTH_ON }); });
  afterAll(async () => { await app.close(); await pool.end(); });
  beforeEach(() => setAssistantDeps({ enabled: true, limiter: new QuestionLimiter(100) }));
  const ask = async (question: string, role = 'leadership') => app.inject({ method: 'POST', url: '/api/assistant',
    headers: await bearer({ sub: `u-${role}`, roles: [role] }), payload: { question } });

  it('AC-ASK-05, AC-ASK-10: the five blocked lanes with reasons, from lane_scores; the same answer twice', async () => {
    const q = 'Which carrier lanes should we stop using, and why?';
    const a = (await ask(q)).json();
    const src = a.sources.find((s: { tool: string }) => s.tool === 'lane_scores');
    expect(src?.args).toEqual({});
    const blocked = (src.result as { blocked: { lane: string; reason: string }[] }).blocked;
    expect(blocked.map((b) => b.lane)).toEqual(['D → Midwest', 'D → Southeast', 'E → West', 'F → Northeast', 'F → Southeast']);
    // Each blocked lane is named with the late rate behind its block (the reason lane_scores gives).
    for (const b of blocked) {
      const [carrier, region] = b.lane.split(' → ');
      expect(a.answer, b.lane).toMatch(new RegExp(`\\b${carrier}\\b[^.;\\n]*${region}|${region}[^.;\\n]*\\b${carrier}\\b`));
      expect(a.answer, b.lane).toMatch(new RegExp(`\\b${/(\d+)% late/.exec(b.reason)![1]}(\\.0)?%`)); // 48% or 48.0%
    }
    expect(a.checked).toBe(true);
    // The product shows what the data says and never decides for Halcyon (CLAUDE.md).
    expect(a.answer).not.toMatch(/\bstop using\b|\bshould\b|\bwe recommend\b/i);
    expect({ ...(await ask(q)).json(), questionId: a.questionId }).toEqual(a);
  });

  it('AC-ASK-04: the on-time rate is written as a percentage, never as a raw fraction', async () => {
    const a = (await ask('What is our on-time rate?')).json();
    expect(a).toMatchObject({ checked: true, refused: false });
    expect(a.answer).toContain('71.0%');
    expect(a.answer).not.toMatch(/\b0\.\d{3,}/);
  });

  it('AC-ASK-06: every out-of-scope question gets the fixed refusal', async () => {
    for (const q of fixture<string[]>('out-of-scope.json')) expect((await ask(q)).json(), q).toMatchObject({ answer: REFUSAL, refused: true });
  });

  it('AC-ASK-07: no Node-written table changes and no Gmail call across every recorded question', async () => {
    const before = await counts();
    for (const { question, role } of fixture<{ question: string; role: string }[]>('questions.json')) await ask(question, role);
    for (const q of fixture<string[]>('out-of-scope.json')) await ask(q);
    expect(await counts()).toEqual(before);
    // No Gmail call is possible: nothing the assistant loads imports Gmail, the intake actions or a write.
    for (const f of ['answer.ts', 'routes.ts', 'figures.ts', 'limit.ts', '../mcp/tools.ts']) {
      const src = readFileSync(new URL(`../../src/modules/assistant/${f}`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/gmail|applyAction|sendReply|INSERT|UPDATE|DELETE|logRecommendation/i);
    }
  });
});
