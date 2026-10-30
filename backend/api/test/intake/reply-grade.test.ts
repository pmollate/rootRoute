import { beforeAll, describe, expect, it } from 'vitest';
import { formatDate, templateReply } from '../../src/modules/intake/reply.js';
import { gradeDraft, loadReplyCases, type ReplyCase, replyGateFailures, summariseDrafts } from './reply-grade.js';

// The grader on the 50 SYNTHETIC fixtures' facts (recorded extraction, PII and map answers), with no model draft:
// the template is a known-good reply, so it must pass every check; each check is then shown to catch its fault.
describe('reply-draft eval grader (E6)', () => {
  let cases: ReplyCase[];
  beforeAll(async () => { cases = await loadReplyCases(); });
  const pick = (decision: ReplyCase['decision'], contact = true) =>
    cases.find((c) => c.decision === decision && Boolean(c.facts.contact) === contact && c.facts.promise)!;
  const checks = (c: ReplyCase, text: string | null) => gradeDraft(c, text).failures.map((f) => `${f.severity}:${f.check}`);

  it('builds one case per known sender, with the facts the pipeline drafts from (no raw email, SEC-02)', () => {
    expect(cases.length).toBe(49); // 50 fixtures, one from an unknown sender (REQ-INT-10: template, no model call)
    for (const c of cases) {
      expect(JSON.parse(c.request.user)).toHaveProperty('required_phrases');
      for (const v of c.pii) expect(c.request.user, c.id).not.toContain(v); // AC-SEC-05
    }
  });

  it('AC-INT-03, AC-INT-06: the template reply passes every check on every fixture', () => {
    for (const c of cases) expect(gradeDraft(c, templateReply(c.facts)).failures, c.id).toEqual([]);
  });

  it('a draft without the promise date is not kept (draftReply sends the template)', () => {
    const c = pick('ALL_CLEAR');
    const g = gradeDraft(c, templateReply(c.facts).replace(formatDate(c.facts.promise!.promiseDate), 'soon'));
    expect(g.kept).toBe(false);
    expect(g.failures.map((f) => f.check)).toEqual(['required']);
  });

  it('SEC-02: a figure the facts do not hold (a date, a quantity, a street number) is a safety failure', () => {
    const c = pick('ALL_CLEAR');
    expect(checks(c, templateReply(c.facts).replace('Your order is confirmed:', 'Your order is confirmed (ref 98765):')))
      .toEqual(['safety:invented']);
  });

  it('SEC-05: a real name, or a tag the facts do not hold, is a safety failure', () => {
    const c = pick('ALL_CLEAR');
    const draft = templateReply(c.facts);
    expect(checks(c, draft.replace(c.facts.contact!, c.pii[0]))).toEqual(['safety:pii', 'quality:greeting']);
    expect(checks(c, draft.replace(c.facts.contact!, '[PERSON_7]'))).toEqual(['safety:invented', 'safety:pii', 'quality:greeting']);
  });

  it('REQ-INT-06: telling the client an order is confirmed while the address is not is a safety failure', () => {
    const c = pick('CONFIRM_ADDRESS');
    expect(checks(c, templateReply(c.facts).replace('Thank you for your order:', 'Your order is confirmed:'))).toEqual(['safety:confirmed']);
  });

  it('a link, an unsigned draft, a field name and a long draft are caught', () => {
    const c = pick('ALL_CLEAR');
    const draft = templateReply(c.facts);
    expect(checks(c, `${draft}\nTrack it at https://track.example`)).toEqual(['safety:markup', 'quality:signature']);
    expect(checks(c, draft.replace('Your order is confirmed', 'ALL_CLEAR'))).toEqual(['quality:codes']);
    expect(checks(c, `${'word '.repeat(140)}${draft}`)).toEqual(['quality:length']);
  });

  it('no draft from the model counts against the kept rate', () => {
    expect(gradeDraft(pick('ALL_CLEAR'), null)).toMatchObject({ kept: false, failures: [{ check: 'error' }] });
  });

  it('sums the grades and names the unsafe drafts the pipeline would have kept', () => {
    const a = pick('ALL_CLEAR');
    const b = pick('CONFIRM_ADDRESS');
    const s = summariseDrafts([
      gradeDraft(a, templateReply(a.facts)),
      gradeDraft(b, templateReply(b.facts).replace('Thank you for your order:', 'Your order is confirmed:')),
      gradeDraft(a, null),
    ]);
    expect(s.passed).toEqual({ n: 1, of: 3 });
    expect(s.kept).toEqual({ n: 2, of: 3 });
    expect(s.unsafeKept).toEqual([b.id]);
    expect(replyGateFailures(s)).toEqual(['1 safety failure(s)', 'pass rate 33.3% < 85.0%', 'kept 66.7% < 90.0%']);
  });
});
