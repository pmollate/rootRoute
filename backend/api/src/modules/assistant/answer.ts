// D10 in-app "Ask LateLens" (owner C, SPEC §5.16). The model routes the question to read-only tools and words the
// answer; code checks every tool request (REQ-ASK-03), runs the tools, builds the sources (REQ-ASK-05) and checks every
// figure (REQ-ASK-04). Nothing here writes a table, sends email or approves (REQ-ASK-07).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthUser, Role } from '../../core/contracts.js';
import { LLMError, type ToolChatLLM, type ToolChatMessage } from '../../core/llm/types.js';
import { PERMISSIONS } from '../../core/permissions.js';
import { type ToolDef, type ToolName, toolParameters } from '../mcp/tools.js';
import { uncheckedFigures } from './figures.js';

export const REFUSAL = "I can only answer questions about Halcyon's delivery data in LateLens: late-delivery causes, the "
  + "replay, carrier lanes, carrier recommendations and delivery promises. I don't make decisions for Halcyon and I don't "
  + "model other companies' products.";
export const COULD_NOT_CHECK = 'I could not check every figure in this answer against LateLens data. Here is what the tools returned.';
export const MAX_QUESTION = 500;
export const MAX_HISTORY = 6;
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

  // At most maxToolCalls tools run, and at most maxToolCalls + 1 model turns (a model that only asks for unknown tools).
  for (let turn = 0; turn <= deps.maxToolCalls; turn += 1) {
    let next;
    try {
      // SEC-ASK-01: once the bound is reached, one last turn may word the answer but is offered no tools.
      const tools = sources.length >= deps.maxToolCalls ? [] : offered;
      next = await deps.llm.toolChat({ system: deps.system, messages, tools, tag: 'assistant', store: false,
        answerSchema: FinalAnswer });
    } catch (err) {
      if (err instanceof LLMError && err.kind === 'refusal') return done(REFUSAL, true, false); // content filter
      throw err;
    }
    if (next.kind === 'final') {
      const content = next.content;
      const parsed = FinalAnswer.safeParse((() => { try { return JSON.parse(content); } catch { return null; } })());
      // REQ-ASK-06: a refusal, or an answer that called no tool, gets the fixed text.
      if (!parsed.success || parsed.data.refused || sources.length === 0) {
        return parsed.success || sources.length === 0 ? done(REFUSAL, true, false) : done(COULD_NOT_CHECK, false, false);
      }
      // REQ-ASK-04 (SPEC v0.12): only what a tool returned or was called with counts; a number only in the question does not.
      const unchecked = uncheckedFigures(parsed.data.answer, [...sources.map((s) => s.args), ...sources.map((s) => s.result)]);
      // SEC-ASK-06: an answer carrying HTML, a Markdown link or a URL is not returned, checked or not.
      const markup = /<|\]\(|https?:|www\./i.test(parsed.data.answer);
      return unchecked.length || markup || parsed.data.answer.length > MAX_ANSWER
        ? done(COULD_NOT_CHECK, false, false) : done(parsed.data.answer, false, true);
    }
    messages.push({ role: 'assistant', content: '', toolCalls: next.calls });
    for (const call of next.calls) {
      if (sources.length >= deps.maxToolCalls) return done(COULD_NOT_CHECK, false, false); // SEC-ASK-01
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
