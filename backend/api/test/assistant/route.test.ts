import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Env } from '../../src/core/config.js';
import type { ToolChatLLM, ToolChatRequest } from '../../src/core/llm/types.js';
import { QuestionLimiter } from '../../src/modules/assistant/limit.js';
import { setAssistantDeps } from '../../src/modules/assistant/routes.js';
import { TOOLS } from '../../src/modules/mcp/tools.js';
import { buildApp } from '../../src/server.js';
import { AUTH_ON, bearer, logSink } from '../token.js';

// No database: stand-in tools and a scripted model (NFR-ASK-03).
const tools = TOOLS.map((t) => ({ ...t, run: async () => ({ onTimeRate: 0.7099 }) }));
let modelCalls = 0;
let seen: ToolChatRequest[] = [];
const llm: ToolChatLLM = { name: 'scripted', json: async () => { throw new Error('x'); }, text: async () => '',
  toolChat: async (req) => { modelCalls += 1; seen.push(req);
    return req.messages.at(-1)!.role === 'user' ? { kind: 'tool_calls', calls: [{ id: '1', name: 'overview', arguments: '{}' }] }
      : { kind: 'final', content: JSON.stringify({ answer: 'On-time is 71.0%.', refused: false }) }; } };
const ask = (headers: Record<string, string>, question = 'What is our on-time rate?') =>
  ({ method: 'POST' as const, url: '/api/assistant', headers, payload: { question } });

describe('POST /api/assistant (D10)', () => {
  let on: FastifyInstance;
  let off: FastifyInstance;
  const sink = logSink();
  beforeAll(async () => { on = await buildApp({ auth: AUTH_ON, logStream: sink.stream }); off = await buildApp({ auth: { required: false } }); });
  afterAll(async () => { await on.close(); await off.close(); });
  beforeEach(() => { modelCalls = 0; seen = []; setAssistantDeps({ enabled: true, llm: () => llm, tools, limiter: new QuestionLimiter(10) }); });

  it('AC-ASK-08: with the flag off, 404 and no model call', async () => {
    setAssistantDeps({ enabled: false });
    expect((await on.inject(ask(await bearer({ sub: 'u1', roles: ['admin'] })))).statusCode).toBe(404);
    expect(modelCalls).toBe(0);
  });

  it('AC-SEC-ASK-05: 401 without a token when on; every role accepted; 401 without x-api-key when off', async () => {
    expect((await on.inject(ask({}))).statusCode).toBe(401);
    for (const role of ['order_desk', 'warehouse_supervisor', 'carrier_manager', 'customer_support', 'leadership', 'admin']) {
      expect((await on.inject(ask(await bearer({ sub: `u-${role}`, roles: [role] })))).statusCode, role).toBe(200);
    }
    expect((await off.inject(ask({}))).statusCode).toBe(401);
    expect((await off.inject(ask({ 'x-api-key': 'test-key' }))).statusCode).toBe(200);
  });

  it('AC-ASK-08: ASK_ASSISTANT is off unless set to on (unset or empty)', () => {
    for (const v of [undefined, '']) expect(Env.shape.ASK_ASSISTANT.parse(v)).toBe('off');
  });

  it('AC-ASK-09: the app setting AUTH_REQUIRED decides: order_desk is offered four tools, and its lane_scores request is skipped', async () => {
    const lanes: ToolChatLLM = { ...llm, toolChat: async (req) => { seen.push(req);
      return req.messages.at(-1)!.role === 'user' ? { kind: 'tool_calls', calls: [{ id: '1', name: 'lane_scores', arguments: '{}' }] }
        : { kind: 'final', content: JSON.stringify({ answer: 'None.', refused: false }) }; } };
    setAssistantDeps({ llm: () => lanes });
    const r = (await on.inject(ask(await bearer({ sub: 'u-od', roles: ['order_desk'] }), 'Which lanes are blocked?'))).json();
    expect(seen[0].tools.map((t) => t.name)).toEqual(['overview', 'delivery_causes', 'scenario', 'check_promise']);
    expect(r).toMatchObject({ skipped: ['lane_scores'], sources: [], refused: true });
    seen = [];
    await on.inject(ask(await bearer({ sub: 'u-cm', roles: ['carrier_manager'] })));
    expect(seen[0].tools).toHaveLength(7);
  });

  it('AC-ASK-12: a tool that fails (a database read) gives 503 assistant_unavailable, with no server text', async () => {
    setAssistantDeps({ tools: TOOLS.map((t) => ({ ...t, run: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432'); } })) });
    const r = await on.inject(ask(await bearer({ sub: 'u1', roles: ['admin'] })));
    expect([r.statusCode, r.json()]).toEqual([503, { error: 'assistant_unavailable' }]);
    expect(r.body).not.toContain('ECONNREFUSED');
  });

  it('AC-SEC-ASK-01: a 501-character question gets 400 and no model call', async () => {
    const r = await on.inject(ask(await bearer({ sub: 'u1', roles: ['admin'] }), 'x'.repeat(501)));
    expect([r.statusCode, r.json()]).toEqual([400, { error: 'too_long' }]);
    expect(modelCalls).toBe(0);
  });

  it('AC-SEC-ASK-02: the 11th question in a minute gets 429 without a model call; another user is not limited', async () => {
    const u1 = await bearer({ sub: 'u1', roles: ['admin'] });
    for (let i = 0; i < 10; i += 1) expect((await on.inject(ask(u1))).statusCode).toBe(200);
    const before = modelCalls;
    expect((await on.inject(ask(u1))).statusCode).toBe(429);
    expect(modelCalls).toBe(before);
    expect((await on.inject(ask(await bearer({ sub: 'u2', roles: ['admin'] })))).statusCode).toBe(200);
  });

  it('AC-NFR-ASK-02: one log line per question with id, user, tools, count, checked, refused, latency; no question text', async () => {
    const r = await on.inject(ask(await bearer({ sub: 'u9', roles: ['leadership'] }), 'What is our on-time rate today?'));
    const line = sink.lines.find((l) => l.questionId === r.json().questionId)!;
    expect(line).toMatchObject({ event: 'assistant_answer', user: 'u9', tools: ['overview'], toolCalls: 1, checked: true, refused: false });
    expect(typeof line.latencyMs).toBe('number');
    expect(JSON.stringify(sink.lines)).not.toContain('on-time rate today');
    // A model-chosen tool name is logged as a registry name or unknown_tool, never as free text.
    setAssistantDeps({ llm: () => ({ ...llm, toolChat: async (req) => req.messages.at(-1)!.role === 'user'
      ? { kind: 'tool_calls', calls: [{ id: '1', name: 'what is our on-time rate today', arguments: '{}' }] }
      : { kind: 'final', content: JSON.stringify({ answer: 'x', refused: false }) } }) });
    const s = (await on.inject(ask(await bearer({ sub: 'u9', roles: ['leadership'] })))).json();
    expect(sink.lines.find((l) => l.questionId === s.questionId)).toMatchObject({ skipped: ['unknown_tool'] });
  });

  it('AC-ASK-10: a missing recording answers 503 assistant_unavailable, not a guess', async () => {
    const { RecordedLLM } = await import('../../src/core/llm/recorded.js');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    setAssistantDeps({ llm: () => new RecordedLLM(mkdtempSync(join(tmpdir(), 'rec-'))) });
    const r = await on.inject(ask(await bearer({ sub: 'u1', roles: ['admin'] })));
    expect([r.statusCode, r.json()]).toEqual([503, { error: 'assistant_unavailable' }]);
  });
});
