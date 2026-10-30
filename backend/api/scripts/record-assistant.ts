// Record the Ask LateLens model turns for CI (C15 Step 11, AC-ASK-10). Asks every question in
// test/fixtures/assistant/questions.json (as its role) and out-of-scope.json (as leadership) through the real route,
// against the TEST database, so the tool results match what test/routes/assistant.test.ts replays.
// Spends model credit: about 2 model calls per question. Prints no answer text (it would land in CI logs).
// Usage (from backend/api, keys in the repo-root .env):
//   RECORD=1 LLM_PROVIDER=azure-openai npm run record:assistant
// Changing prompts/system.md or a tool's description changes every recording: run this again and commit the new files.
import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
// As test/setup.ts: the replay runs against the test database, so the recording must too.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://latelens:latelens@localhost:5432/latelens_test';
process.env.ASK_ASSISTANT = 'on';
process.env.NODE_ENV = 'test'; // as the replay; also keeps Fastify's request logs out of the output

const { pool } = await import('../src/core/db/pool.js');
const { QuestionLimiter } = await import('../src/modules/assistant/limit.js');
const { setAssistantDeps } = await import('../src/modules/assistant/routes.js');
const { buildApp } = await import('../src/server.js');
const { AUTH_ON, bearer } = await import('../test/token.js');

const fixture = <T>(f: string) => JSON.parse(readFileSync(new URL(`../test/fixtures/assistant/${f}`, import.meta.url), 'utf8')) as T;
const questions = [
  ...fixture<{ id: string; question: string; role: string }[]>('questions.json'),
  ...fixture<string[]>('out-of-scope.json').map((question, i) => ({ id: `AC-ASK-06 #${i + 1}`, question, role: 'leadership' })),
];

const app = await buildApp({ auth: AUTH_ON });
setAssistantDeps({ enabled: true, limiter: new QuestionLimiter(1000) });
for (const q of questions) {
  const r = await app.inject({ method: 'POST', url: '/api/assistant', headers: await bearer({ sub: `u-${q.role}`, roles: [q.role] }),
    payload: { question: q.question } });
  const a = r.json() as { checked?: boolean; refused?: boolean; sources?: { tool: string; args: unknown }[]; skipped?: string[]; error?: string };
  console.log(`${q.id.padEnd(14)} ${q.role.padEnd(16)} ${r.statusCode} ${a.error ?? `checked ${a.checked} refused ${a.refused}`}`
    + `  sources ${JSON.stringify(a.sources?.map((s) => [s.tool, s.args]) ?? [])}  skipped ${JSON.stringify(a.skipped ?? [])}`);
}
await app.close();
await pool.end();
