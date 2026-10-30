// Reply-draft eval (E6): the model's raw draft for each SYNTHETIC fixture with a known sender, graded by code
// (test/intake/reply-grade.ts) before draftReply's template fallback, with the scores and the gate. The facts come from
// the recorded extraction, PII and map answers, so only the drafting step calls the model. Exits 1 if the gate fails.
// Spends model credit: 49 model calls per run. Draft text is printed only with --verbose.
// Usage (from backend/api, keys in the repo-root .env):
//   LLM_PROVIDER=azure-openai npm run eval:reply                # score the live model
//   RECORD=1 LLM_PROVIDER=azure-openai npm run eval:reply       # record the drafts for CI (commit test/recordings/)
//   npm run eval:reply -- 03 34 --verbose                       # only these fixture ids
// Changing prompts/reply.md changes every recording: record again.
import { createLLM } from '../src/core/llm/index.js';
import { LLMError } from '../src/core/llm/types.js';
import { gradeDraft, loadReplyCases, replyGateFailures, replyReport, summariseDrafts } from '../test/intake/reply-grade.js';

const args = process.argv.slice(2).filter((a) => a !== '--verbose');
const verbose = process.argv.includes('--verbose');
const cases = (await loadReplyCases()).filter((c) => args.length === 0 || args.includes(c.id));
const llm = createLLM();
const graded = [];
const unrecorded: string[] = [];
for (const c of cases) {
  let text: string | null = null;
  try {
    text = await llm.text(c.request);
  } catch (err) {
    if (!(err instanceof LLMError) || err.kind === 'transport') throw err;
    // LLM_PROVIDER=recorded: a fixture with no recorded draft is listed and left out of the scores, as in reply-eval.test.ts.
    if (err.kind === 'missing_recording') { unrecorded.push(c.id); console.log(`--   ${c.id} ${c.decision.padEnd(15)} not recorded`); continue; }
  }
  const g = gradeDraft(c, text);
  graded.push(g);
  console.log(`${g.failures.length ? 'FAIL' : 'ok  '} ${c.id} ${c.decision.padEnd(15)} ${g.kept ? 'kept' : 'template'}`);
  for (const f of g.failures) console.log(`      ${f.severity === 'safety' ? 'SAFETY ' : ''}${f.check}: ${f.detail}`);
  if (verbose && text) console.log(text.replace(/^/gm, '      | '));
}

const s = summariseDrafts(graded);
const gate = graded.length ? replyGateFailures(s) : ['no draft graded'];
console.log(`\n${replyReport(s)}\n\n${graded.length} drafts using ${llm.name}${unrecorded.length ? ` (${unrecorded.length} not recorded)` : ''}`
  + `: gate ${gate.length ? `FAILED (${gate.join('; ')})` : 'passed'}`);
process.exitCode = gate.length ? 1 : 0;
