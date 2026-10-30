import { describe, expect, it } from 'vitest';
import { RecordedLLM } from '../../src/core/llm/recorded.js';
import { LLMError } from '../../src/core/llm/types.js';
import { gradeDraft, type GradedDraft, loadReplyCases, replyGateFailures, replyReport, summariseDrafts } from './reply-grade.js';

// The reply-draft eval on recorded drafts: the same cases, grader and gate as `npm run eval:reply`. Record with:
// RECORD=1 LLM_PROVIDER=azure-openai npm run eval:reply. A fixture with no recorded draft is left out and listed; the
// test skips if none is recorded. A recorded refusal or invalid draft counts as no draft (the template went out).
describe('reply-draft eval (recorded drafts)', () => {
  it('AC-INT-03, AC-INT-06, AC-SEC-02, AC-SEC-05: the recorded drafts pass the eval gate', async (ctx) => {
    const llm = new RecordedLLM();
    const graded: GradedDraft[] = [];
    const unrecorded: string[] = [];
    for (const c of await loadReplyCases()) {
      try {
        graded.push(gradeDraft(c, await llm.text(c.request)));
      } catch (err) {
        if (!(err instanceof LLMError)) throw err;
        if (err.kind === 'missing_recording') unrecorded.push(c.id);
        else graded.push(gradeDraft(c, null));
      }
    }
    if (graded.length === 0) ctx.skip();
    if (unrecorded.length) console.warn(`reply eval: ${unrecorded.length} draft(s) not recorded: ${unrecorded.join(', ')}`);
    const s = summariseDrafts(graded);
    expect(replyGateFailures(s), replyReport(s)).toEqual([]);
  });
});
