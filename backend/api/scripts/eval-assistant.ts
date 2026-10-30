// Ask LateLens eval (D10, SPEC §5.16): every case in test/fixtures/assistant/eval-cases.json through the real answer loop,
// graded by code (test/assistant/eval-grade.ts), with the scores and the gate. Runs against the TEST database, as
// record-assistant does, so recorded turns replay in test/assistant/eval.test.ts. Exits 1 if the gate fails.
// Spends model credit: 2 to 4 model calls per case and run. Answer text is printed only with --verbose.
// Usage (from backend/api, keys in the repo-root .env):
//   LLM_PROVIDER=azure-openai npm run eval:assistant                    # score the live model
//   LLM_PROVIDER=azure-openai npm run eval:assistant -- --repeat 3      # pass^3: a case passes only if all 3 runs pass
//   RECORD=1 LLM_PROVIDER=azure-openai npm run eval:assistant           # record the turns for CI (commit test/recordings/)
//   npm run eval:assistant -- injection oos-03 --verbose                # only these categories or case ids
// Changing prompts/system.md, a tool's description or a tool's data changes the recordings: record again.
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://latelens:latelens@localhost:5432/latelens_test';
process.env.NODE_ENV = 'test';

const { pool } = await import('../src/core/db/pool.js');
const { createLLM, LLMError } = await import('../src/core/llm/index.js');
const { askCase, gateFailures, grade, loadCases, mergeRuns, report, summarise } = await import('../test/assistant/eval-grade.js');

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, name === '--verbose' ? 1 : 2)[1] ?? ''; };
const verbose = flag('--verbose') !== null;
const repeat = Number(flag('--repeat') ?? 1);
if (!Number.isInteger(repeat) || repeat < 1) throw new Error('--repeat needs a whole number of runs');
if (repeat > 1 && process.env.RECORD === '1') throw new Error('RECORD=1 keeps one turn per prompt: record with one run');

const cases = loadCases().filter((c) => args.length === 0 || args.includes(c.id) || args.includes(c.category));
const llm = createLLM();
const graded = [];
const unrecorded: string[] = [];
for (const c of cases) {
  const runs = [];
  try {
    for (let i = 0; i < repeat; i += 1) {
      const { answer, allowed } = await askCase(c, llm);
      runs.push(grade(c, answer, allowed));
      if (verbose) console.log(`      run ${i + 1} [${answer.sources.map((s) => s.tool).join(', ')}] ${answer.answer.slice(0, 300).replace(/\n/g, ' ')}`);
    }
  } catch (err) {
    // LLM_PROVIDER=recorded: a case with no recording is listed and left out of the scores, as in eval.test.ts.
    if (!(err instanceof LLMError && err.kind === 'missing_recording')) throw err;
    unrecorded.push(c.id);
    console.log(`--   ${c.id.padEnd(14)} ${c.category.padEnd(12)} not recorded`);
    continue;
  }
  const g = mergeRuns(runs);
  graded.push(g);
  console.log(`${g.failures.length ? 'FAIL' : 'ok  '} ${c.id.padEnd(14)} ${c.category.padEnd(12)} ${g.outcome}`);
  for (const f of g.failures) console.log(`      ${f.severity === 'safety' ? 'SAFETY ' : ''}${f.check}: ${f.detail}`);
}
await pool.end();

const s = summarise(cases, graded);
const gate = graded.length ? gateFailures(s) : ['no case graded'];
console.log(`\n${report(s)}\n\n${graded.length} cases × ${repeat} run(s) using ${llm.name}`
  + `${unrecorded.length ? ` (${unrecorded.length} not recorded)` : ''}: gate ${gate.length ? `FAILED (${gate.join('; ')})` : 'passed'}`);
process.exitCode = gate.length ? 1 : 0;
