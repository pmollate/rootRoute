import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/core/db/pool.js';
import { RecordedLLM } from '../../src/core/llm/recorded.js';
import { LLMError } from '../../src/core/llm/types.js';
import { hasDb } from '../db.js';
import { askCase, gateFailures, grade, type Graded, loadCases, report, summarise } from './eval-grade.js';

// The Ask LateLens eval on recorded turns: the same cases, grader and gate as `npm run eval:assistant`, free and
// repeatable. Record with: RECORD=1 LLM_PROVIDER=azure-openai npm run eval:assistant. A case with no recording yet is
// left out and listed; the file skips if no case is recorded.
describe.skipIf(!hasDb)('Ask LateLens eval (recorded turns, test database)', () => {
  afterAll(async () => { await pool.end(); });

  it('AC-ASK-03/04/05/06/09/11/13, AC-SEC-ASK-06: the recorded cases pass the eval gate', async (ctx) => {
    const cases = loadCases();
    const llm = new RecordedLLM();
    const graded: Graded[] = [];
    const unrecorded: string[] = [];
    for (const c of cases) {
      try {
        const { answer, allowed } = await askCase(c, llm);
        graded.push(grade(c, answer, allowed));
      } catch (err) {
        if (!(err instanceof LLMError && err.kind === 'missing_recording')) throw err;
        unrecorded.push(c.id);
      }
    }
    if (graded.length === 0) ctx.skip();
    if (unrecorded.length) console.warn(`assistant eval: ${unrecorded.length} case(s) not recorded: ${unrecorded.join(', ')}`);
    const s = summarise(cases, graded);
    expect(gateFailures(s), report(s)).toEqual([]);
  });
});
