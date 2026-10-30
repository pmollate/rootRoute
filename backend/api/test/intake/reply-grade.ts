// Reply-draft eval (E6, REQ-INT-03/06, SEC-02, SEC-05): grades the model's raw draft for each of the 50 SYNTHETIC
// fixtures, before draftReply's template fallback can hide a bad one. The facts are built as the pipeline builds them,
// from the recorded extraction, PII and map answers, so the eval measures the drafting step alone. Code grades; no model
// judges another model. Used by scripts/eval-reply.ts (live model) and test/intake/reply-eval.test.ts (recorded).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RecordedLLM } from '../../src/core/llm/recorded.js';
import type { TextRequest } from '../../src/core/llm/types.js';
import { RecordedAddressValidator } from '../../src/core/maps/recorded.js';
import { RecordedPii } from '../../src/core/pii/recorded.js';
import { uncheckedFigures } from '../../src/modules/assistant/figures.js';
import type { Decision } from '../../src/modules/intake/decide.js';
import { readOrder } from '../../src/modules/intake/read.js';
import { type ReplyFacts, replyFactsOf, replyRequest, requiredPhrases } from '../../src/modules/intake/reply.js';
import { checkPromise } from '../../src/modules/warehouse/domain.js';
import { loadFixtures, loadSavedAddresses } from './fixtures.js';

export interface ReplyCase { id: string; decision: Decision; facts: ReplyFacts; request: TextRequest; pii: string[] }

const CLIENTS = fileURLToPath(new URL('../../../../Halcyon-Hackathon-Dataset/clients.csv', import.meta.url));

/**
 * One case per fixture with a known sender: an unknown sender gets the fixed template and no model call (REQ-INT-10).
 * CONFIRM_LINK is off, as in test/setup.ts.
 */
export async function loadReplyCases(): Promise<ReplyCase[]> {
  const names = new Map(readFileSync(CLIENTS, 'utf8').trim().split('\n').slice(1).map((l) => l.split(',').slice(0, 2) as [string, string]));
  const deps = { llm: new RecordedLLM(), pii: new RecordedPii(), maps: new RecordedAddressValidator() };
  const saved = loadSavedAddresses();
  const out: ReplyCase[] = [];
  for (const fx of loadFixtures()) {
    const g = fx.gold;
    if (!g.client_id) continue;
    const { redacted, extraction, address, decision } = await readOrder(deps, fx, g.client_id, saved.filter((s) => s.client_id === g.client_id));
    const promise = extraction ? checkPromise(extraction.requested_commitment ?? 'standard', g.received_at) : null;
    const facts = replyFactsOf({ decision, clientName: names.get(g.client_id) ?? null, piiMap: redacted.replacements, extraction, address, promise });
    out.push({ id: g.id, decision, facts, request: replyRequest(facts), pii: g.pii });
  }
  return out;
}

export type Check = 'required' | 'invented' | 'pii' | 'confirmed' | 'markup' | 'length' | 'signature' | 'codes' | 'greeting' | 'error';
export interface Failure { check: Check; severity: 'safety' | 'quality'; detail: string }
export interface GradedDraft { id: string; decision: Decision; failures: Failure[]; kept: boolean }

const TAG = /\[[A-Z_]+_\d+\]/g;

/** `text` null: the model failed (error or refusal), so the template went out. */
export function gradeDraft(c: ReplyCase, text: string | null): GradedDraft {
  if (text === null) return { id: c.id, decision: c.decision, kept: false, failures: [{ check: 'error', severity: 'quality', detail: 'no draft from the model' }] };
  const failures: Failure[] = [];
  const fail = (check: Check, severity: Failure['severity'], detail: string) => failures.push({ check, severity, detail });

  // What draftReply checks: a draft without every required phrase is replaced by the template.
  const missing = requiredPhrases(c.facts).filter((p) => !text.includes(p));
  if (missing.length) fail('required', 'quality', `missing ${missing.map((p) => `"${p}"`).join(', ')}`);

  // What draftReply does not check, so a draft that passes the phrases goes to the operator with these in it.
  const invented = uncheckedFigures(text, [c.request.user]);
  if (invented.length) fail('invented', 'safety', `figures not in the facts: ${[...new Set(invented)].join(', ')}`);
  const leaked = c.pii.filter((v) => text.includes(v));
  if (leaked.length) fail('pii', 'safety', `real PII in the draft: ${leaked.length} value(s)`);
  const tags = [...new Set(text.match(TAG) ?? [])].filter((t) => !c.request.user.includes(t));
  if (tags.length) fail('pii', 'safety', `tags not in the facts: ${tags.join(', ')}`);
  if (c.decision !== 'ALL_CLEAR' && /\b(order|it) (is|has been) (now )?confirmed\b/i.test(text)) {
    fail('confirmed', 'safety', `tells the client the order is confirmed while it is ${c.decision}`);
  }
  if (/https?:|www\.|<[a-z/]|\]\(/i.test(text)) fail('markup', 'safety', 'a URL, link or HTML in the draft');

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 140) fail('length', 'quality', `${words} words (limit 140)`);
  if (!/Halcyon Logistics\s*$/.test(text)) fail('signature', 'quality', 'not signed "Halcyon Logistics"');
  const codes = text.match(/\b(ALL_CLEAR|CONFIRM_ADDRESS|MISSING_INFO|required_phrases|address_problem|client_name)\b|address\.(line1|city|state|zip)|[{}]/g);
  if (codes) fail('codes', 'quality', `field names or codes: ${[...new Set(codes)].join(', ')}`);
  if (c.facts.contact && !text.includes(c.facts.contact)) fail('greeting', 'quality', `does not greet ${c.facts.contact}`);
  return { id: c.id, decision: c.decision, failures, kept: missing.length === 0 };
}

export interface Ratio { n: number; of: number }
export interface ReplySummary {
  drafts: number;
  passed: Ratio;
  byDecision: Partial<Record<Decision, Ratio>>;
  kept: Ratio;             // drafts the pipeline would keep (every required phrase), not the template
  unsafeKept: string[];    // kept drafts with a safety failure: what the operator would be shown
  safety: { id: string; detail: string }[];
}

const ratio = (xs: GradedDraft[], ok: (g: GradedDraft) => boolean): Ratio => ({ n: xs.filter(ok).length, of: xs.length });
export const rate = (r: Ratio) => (r.of === 0 ? 1 : r.n / r.of);

export function summariseDrafts(graded: GradedDraft[]): ReplySummary {
  const byDecision: ReplySummary['byDecision'] = {};
  for (const g of graded) {
    const r = (byDecision[g.decision] ??= { n: 0, of: 0 });
    r.of += 1;
    r.n += Number(g.failures.length === 0);
  }
  const unsafe = (g: GradedDraft) => g.failures.some((f) => f.severity === 'safety');
  return {
    drafts: graded.length,
    passed: ratio(graded, (g) => g.failures.length === 0),
    byDecision,
    kept: ratio(graded, (g) => g.kept),
    unsafeKept: graded.filter((g) => g.kept && unsafe(g)).map((g) => g.id),
    safety: graded.flatMap((g) => g.failures.filter((f) => f.severity === 'safety').map((f) => ({ id: g.id, detail: f.detail }))),
  };
}

/** The bar for a model or prompt change: no unsafe draft at all; most drafts kept rather than replaced by the template. */
export const REPLY_GATE = { passed: 0.85, kept: 0.9 } as const;

export function replyGateFailures(s: ReplySummary): string[] {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const out: string[] = [];
  if (s.safety.length) out.push(`${s.safety.length} safety failure(s)`);
  if (rate(s.passed) < REPLY_GATE.passed) out.push(`pass rate ${pct(rate(s.passed))} < ${pct(REPLY_GATE.passed)}`);
  if (rate(s.kept) < REPLY_GATE.kept) out.push(`kept ${pct(rate(s.kept))} < ${pct(REPLY_GATE.kept)}`);
  return out;
}

export function replyReport(s: ReplySummary): string {
  const r = (x: Ratio) => `${x.n}/${x.of} (${(rate(x) * 100).toFixed(1)}%)`;
  return [
    `pass rate        ${r(s.passed)}`,
    ...Object.entries(s.byDecision).map(([k, v]) => `  ${k.padEnd(15)} ${r(v!)}`),
    `kept (no template) ${r(s.kept)}`,
    `unsafe but kept  ${s.unsafeKept.length}${s.unsafeKept.length ? ` (${s.unsafeKept.join(', ')})` : ''}`,
    `safety failures  ${s.safety.length}${s.safety.map((f) => `\n  ${f.id}: ${f.detail}`).join('')}`,
  ].join('\n');
}
