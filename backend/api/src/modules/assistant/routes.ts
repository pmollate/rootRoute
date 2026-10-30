// POST /api/assistant (D10, SPEC §5.16; owner C). Roles: core/permissions.ts (every role; x-api-key while AUTH_REQUIRED=off).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyPluginAsync } from 'fastify';
import { config } from '../../core/config.js';
import type { AuthUser } from '../../core/contracts.js';
import { createLLM } from '../../core/llm/index.js';
import { LLMError, type ToolChatLLM } from '../../core/llm/types.js';
import { TOOLS, type ToolDef } from '../mcp/tools.js';
import { answerQuestion, AssistantRequestSchema, MAX_QUESTION } from './answer.js';
import { QuestionLimiter } from './limit.js';

export const SYSTEM = readFileSync(fileURLToPath(new URL('./prompts/system.md', import.meta.url)), 'utf8');

export interface AssistantDeps {
  enabled: boolean;          // ASK_ASSISTANT=on (REQ-ASK-08)
  authRequired: boolean;     // AUTH_REQUIRED=on: tools by role (REQ-ASK-09)
  maxToolCalls: number;      // ASK_MAX_TOOL_CALLS (SEC-ASK-01)
  llm: () => ToolChatLLM;    // created on first use, so a missing key never breaks start-up with the flag off
  tools: readonly ToolDef[];
  limiter: QuestionLimiter;  // ASK_RATE_PER_MINUTE (SEC-ASK-02)
}

let current: AssistantDeps | null = null;
let llm: ToolChatLLM | null = null;
export function getAssistantDeps(): AssistantDeps {
  current ??= { enabled: config.ASK_ASSISTANT === 'on', authRequired: config.AUTH_REQUIRED === 'on',
    maxToolCalls: config.ASK_MAX_TOOL_CALLS, llm: () => (llm ??= createLLM()), tools: TOOLS,
    limiter: new QuestionLimiter(config.ASK_RATE_PER_MINUTE) };
  return current;
}
/** Tests swap in a scripted model, stand-in tools, the flag or a fresh limiter. */
export function setAssistantDeps(over: Partial<AssistantDeps>): void { current = { ...getAssistantDeps(), ...over }; }

/** SEC-ASK-02: one limit per signed-in user; every call without a session shares one (AUTH_REQUIRED=off). */
const limitKey = (user: AuthUser | null) => (user && user.roles.length > 0 ? user.id : 'no-session');

const routes: FastifyPluginAsync = async (app) => {
  app.post('/assistant', async (req, reply) => {
    const deps = getAssistantDeps();
    if (!deps.enabled) return reply.code(404).send({ error: 'not_found' });          // REQ-ASK-08: no model call
    const q = (req.body as { question?: unknown } | null)?.question;
    if (typeof q === 'string' && q.trim().length > MAX_QUESTION) return reply.code(400).send({ error: 'too_long' });
    const body = AssistantRequestSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    if (!deps.limiter.take(limitKey(req.user))) {
      req.log.warn({ event: 'assistant_rate_limited', user: req.user?.id ?? null }, 'assistant rate limited');
      return reply.code(429).send({ error: 'rate_limited' });
    }
    const started = Date.now();
    try {
      const a = await answerQuestion(body.data, req.user, { llm: deps.llm(), tools: deps.tools, authRequired: deps.authRequired,
        maxToolCalls: deps.maxToolCalls, system: SYSTEM });
      // NFR-ASK-02: one line per question, never the question or answer text.
      req.log.info({ event: 'assistant_answer', questionId: a.questionId, user: req.user?.id ?? null,
        tools: a.sources.map((s) => s.tool), toolCalls: a.toolCalls, skipped: a.skipped, checked: a.checked, refused: a.refused,
        latencyMs: Date.now() - started }, 'assistant answered');
      return a;
    } catch (err) {
      if (!(err instanceof LLMError)) throw err;
      req.log.warn({ event: 'assistant_unavailable', user: req.user?.id ?? null, kind: err.kind }, 'assistant unavailable');
      return reply.code(503).send({ error: 'assistant_unavailable' });
    }
  });
};

export default routes;
