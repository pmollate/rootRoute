// D10 in-app "Ask LateLens" (owner C, SPEC §5.16). The model routes the question to read-only tools and words the
// answer; code checks every tool request (REQ-ASK-03), runs the tools, builds the sources (REQ-ASK-05) and checks every
// figure (REQ-ASK-04). Nothing here writes a table, sends email or approves (REQ-ASK-07).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthUser, Role } from '../../core/contracts.js';
import { LLMError, type ToolChatLLM, type ToolChatMessage } from '../../core/llm/types.js';
import { PERMISSIONS } from '../../core/permissions.js';
import { type ToolDef, type ToolName, toolParameters } from '../mcp/tools.js';
import { figuresIn, uncheckedFigures } from './figures.js';

// REQ-ASK-06 (v0.17): the scope is the current client's own data and Root Route's analysis of it.
export const REFUSAL = "I can only answer questions about Halcyon's own delivery data and Root Route's analysis of it. I don't act "
  + "for Halcyon and I don't cover other companies' products or anything outside Halcyon's deliveries.";
export const COULD_NOT_CHECK = 'I could not check every figure in this answer against Root Route data. Here is what the tools returned.';
/** REQ-ASK-06 (v0.17): how an in-scope question no tool can answer begins; with no figures it is shown, not refused. */
export const NOT_HELD = "Root Route's tools don't hold that";
export const MAX_QUESTION = 500;
export const MAX_HISTORY = 12; // SEC-ASK-01 (v0.17): six earlier exchanges of the window's conversation
export const MAX_ANSWER = 2000;

// The history comes from the client, so it is as untrusted as the question: user turns keep the question limit
// (SEC-ASK-01) and assistant turns the length of an answer.
const Turn = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), text: z.string().max(MAX_QUESTION) }),
  z.object({ role: z.literal('assistant'), text: z.string().max(MAX_ANSWER) }),
]);
export const AssistantRequestSchema = z.object({
  question: z.string().trim().min(1),
  history: z.array(Turn).max(MAX_HISTORY).default([]),
});
export type AssistantRequest = z.input<typeof AssistantRequestSchema>;
export const FinalAnswer = z.object({ answer: z.string(), refused: z.boolean() });

export interface Source { tool: ToolName; args: Record<string, unknown>; result: unknown }
export interface AssistantAnswer {
  questionId: string; answer: string; refused: boolean; checked: boolean; sources: Source[]; toolCalls: number; skipped: string[];
}

/** Tools by role (SPEC §5.16, default until Q-ASK-03): a tool goes to the roles that may read the route with its data. */
const TOOL_ROUTE: Record<ToolName, string | null> = {
  overview: 'GET /api/overview', delivery_causes: 'GET /api/causes', scenario: 'GET /api/replay',
  check_promise: null, lane_scores: 'GET /api/carriers', recommend_carrier: 'GET /api/carriers',
  route_overruns: 'GET /api/routes/overruns', // C9a (SPEC §5.18): same roles as lane_scores
};

/** REQ-ASK-09: with AUTH_REQUIRED=on, only the tools the user's roles may read; with it off, every tool (as every screen). */
export function toolsFor(tools: readonly ToolDef[], user: AuthUser | null, authRequired: boolean): ToolDef[] {
  if (!authRequired) return [...tools];
  const roles: readonly Role[] = user?.roles ?? [];
  return tools.filter((t) => {
    const route = TOOL_ROUTE[t.name];
    if (route === null) return roles.length > 0;
    const p = PERMISSIONS[route];
    return typeof p === 'object' && 'roles' in p && roles.some((r) => p.roles.includes(r));
  });
}

export const SUGGESTION = 'Suggestion (from the data, not a decision):';

/** REQ-ASK-13: advice ("stop using", "should", "we recommend") anywhere but the labelled suggestion paragraph. */
export function adviceOutsideSuggestion(answer: string): boolean {
  return /\bstop using\b|\bshould\b|\bwe recommend\b/i.test(answer.split(SUGGESTION)[0]);
}

/** REQ-ASK-13: a bare one-word verdict ("SIGN", "DON'T SIGN") is a decision for Halcyon, never an answer. */
export function verdictOnly(answer: string): boolean {
  return /^\W*(sign|don'?t sign)\W*$/i.test(answer);
}

/** A raw fraction from a tool (0.8035532415950516) as a percentage with one decimal (80.4%). */
export function percentages(answer: string): string {
  return answer.replace(/\b0\.\d{3,}\b/g, (x) => `${(Number(x) * 100).toFixed(1)}%`);
}

/** Tool field or scenario names left in an answer (prePickupShare, as_built_phase2). */
export function styleIssues(answer: string): string[] {
  return [...new Set(answer.match(/\b[a-z]+(?:[A-Z][a-z]+)+\b|\b[a-z]+(?:_[a-z0-9]+)+\b/g) ?? [])];
}

/** The rewrite turn's instruction: the figures no tool returned, the length limit if it was passed, raw tool output. */
export function rewriteRequest(unchecked: string[], long: boolean, style: string[] = [], advice = false): string {
  const parts = [];
  if (advice) parts.push(`State the evidence without telling Halcyon what to do; advice may only appear in a last paragraph that starts "${SUGGESTION}".`);
  if (unchecked.length) parts.push(`These figures are not in any tool result: ${[...new Set(unchecked)].join(', ')}. Remove them or `
    + 'replace them with figures the tools returned, written as the rules say.');
  if (long) parts.push(`The answer is longer than ${MAX_ANSWER} characters; shorten it to under 1,500.`);
  if (style.length) parts.push(`Replace these tool field names with plain words and keep everything else: ${style.join(', ')}.`);
  return `${parts.join(' ')} Reply with the same JSON and nothing else.`;
}

export interface AnswerDeps { llm: ToolChatLLM; tools: readonly ToolDef[]; authRequired: boolean; maxToolCalls: number; system: string }

export async function answerQuestion(input: z.output<typeof AssistantRequestSchema>, user: AuthUser | null,
  deps: AnswerDeps): Promise<AssistantAnswer> {
  const questionId = randomUUID();
  const allowed = toolsFor(deps.tools, user, deps.authRequired);
  const offered = allowed.map((t) => ({ name: t.name, description: t.description, parameters: toolParameters(t) }));
  const messages: ToolChatMessage[] = [
    ...input.history.map((h) => ({ role: h.role, content: h.text })),
    { role: 'user', content: input.question },
  ];
  const sources: Source[] = [];
  const skipped: string[] = [];
  const done = (answer: string, refused: boolean, checked: boolean): AssistantAnswer =>
    ({ questionId, answer, refused, checked, sources, toolCalls: sources.length, skipped });

  // At most maxToolCalls tools run, and at most maxToolCalls + 2 model turns: the last wording turn and one rewrite.
  let repairing = false;
  let fallback: string | null = null; // a checked first answer rewritten only for style: kept if the rewrite fails
  for (let turn = 0; turn <= deps.maxToolCalls + 1; turn += 1) {
    let next;
    // SEC-ASK-01: once the bound is reached, or while rewriting, the model is offered no tools.
    const tools = sources.length >= deps.maxToolCalls || repairing ? [] : offered;
    try {
      next = await deps.llm.toolChat({ system: deps.system, messages, tools, tag: 'assistant', store: false,
        answerSchema: FinalAnswer });
    } catch (err) {
      if (err instanceof LLMError && err.kind === 'refusal') return done(REFUSAL, true, false); // content filter
      throw err;
    }
    if (next.kind === 'final') {
      const content = next.content;
      const raw = FinalAnswer.safeParse((() => { try { return JSON.parse(content); } catch { return null; } })());
      // REQ-ASK-11 (v0.16): a raw fraction (0.8035…) is written as a percentage by code, not sent back to the model.
      const parsed = raw.success ? { ...raw, data: { ...raw.data, answer: percentages(raw.data.answer) } } : raw;
      if (fallback && (!parsed.success || parsed.data.refused)) return done(fallback, false, true);
      // REQ-ASK-13: code, not the prompt, keeps a bare SIGN / DON'T SIGN verdict from ever being shown (eval injection-05).
      if (parsed.success && verdictOnly(parsed.data.answer)) return done(REFUSAL, true, false);
      // REQ-ASK-06 (v0.17): in scope but no tool holds it: shown only as the fixed opening, with no figures.
      if (parsed.success && !parsed.data.refused && sources.length === 0 && parsed.data.answer.startsWith(NOT_HELD)
        && !figuresIn(parsed.data.answer).length && !/<|\]\(|https?:|www\./i.test(parsed.data.answer)
        && parsed.data.answer.length <= MAX_ANSWER) {
        return done(parsed.data.answer, false, true);
      }
      // REQ-ASK-06: a refusal, or any other answer that called no tool, gets the fixed text.
      if (!parsed.success || parsed.data.refused || sources.length === 0) {
        return parsed.success || sources.length === 0 ? done(REFUSAL, true, false) : done(COULD_NOT_CHECK, false, false);
      }
      // REQ-ASK-04 (SPEC v0.12): only what a tool returned or was called with counts; a number only in the question does not.
      const unchecked = uncheckedFigures(parsed.data.answer, [...sources.map((s) => s.args), ...sources.map((s) => s.result)]);
      // SEC-ASK-06: an answer carrying HTML, a Markdown link or a URL is not returned, checked or not, and not rewritten.
      const markup = /<|\]\(|https?:|www\./i.test(parsed.data.answer);
      const long = parsed.data.answer.length > MAX_ANSWER;
      const style = styleIssues(parsed.data.answer);
      const advice = adviceOutsideSuggestion(parsed.data.answer);
      // REQ-ASK-11 (v0.16): raw fractions or tool field names get the rewrite too, but never blank a checked answer.
      // A style rewrite that dropped every figure, or most of the answer, is worse than the first: keep the first.
      if (fallback && (!figuresIn(parsed.data.answer).length || parsed.data.answer.length < fallback.length / 2)) {
        return done(fallback, false, true);
      }
      if (!markup && !unchecked.length && !long && !advice && (!style.length || repairing)) return done(parsed.data.answer, false, true);
      // REQ-ASK-04 (v0.16): once, the model is told what failed and rewrites with no tools; a second failure is final.
      if (markup || repairing) return fallback ? done(fallback, false, true) : done(COULD_NOT_CHECK, false, false);
      if (!unchecked.length && !long && !advice) fallback = parsed.data.answer;
      repairing = true;
      messages.push({ role: 'assistant', content }, { role: 'user', content: rewriteRequest(unchecked, long, style, advice) });
      continue;
    }
    // SEC-ASK-01: a tool asked for on the last turn or the rewrite, when none was offered, ends the question.
    if (fallback) return done(fallback, false, true);
    if (sources.length >= deps.maxToolCalls || repairing) return done(COULD_NOT_CHECK, false, false);
    messages.push({ role: 'assistant', content: '', toolCalls: next.calls });
    for (const call of next.calls) {
      // SEC-ASK-01: calls past the bound in one turn are not run; the model is told and words its answer on the last turn.
      if (sources.length >= deps.maxToolCalls) {
        skipped.push(call.name);
        messages.push({ role: 'tool', toolCallId: call.id, content: 'Tool limit reached: not run. Answer from the results you have.' });
        continue;
      }
      const tool = allowed.find((t) => t.name === call.name);
      let args: unknown = null;
      try { args = JSON.parse(call.arguments || '{}'); } catch { /* invalid below */ }
      const valid = tool ? z.object(tool.input).safeParse(args) : null;
      if (!tool || !valid?.success) {
        skipped.push(call.name); // REQ-ASK-03: not run; the model is told
        messages.push({ role: 'tool', toolCallId: call.id,
          content: tool ? `Invalid arguments for ${call.name}.` : `Tool ${call.name} is not available.` });
        continue;
      }
      const result = await tool.run(valid.data as never);
      sources.push({ tool: tool.name, args: valid.data as Record<string, unknown>, result });
      messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result) });
    }
  }
  return done(COULD_NOT_CHECK, false, false);
}
