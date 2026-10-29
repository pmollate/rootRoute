import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AzureOpenAILLM } from '../../src/core/llm/azureOpenai.js';
import { RecordedLLM, RecordingLLM } from '../../src/core/llm/recorded.js';
import type { ToolChatLLM, ToolChatRequest } from '../../src/core/llm/types.js';

// Inlined until C15 creates src/modules/assistant/answer.ts; C15 Step 5 switches this to the import.
const FinalAnswer = z.object({ answer: z.string(), refused: z.boolean() });

const REQ: ToolChatRequest = { system: 'S', tag: 'assistant', store: false, answerSchema: FinalAnswer,
  messages: [{ role: 'user', content: 'What is our on-time rate?' }],
  tools: [{ name: 'overview', description: 'KPIs', parameters: { type: 'object', properties: {} } }] };

function fakeAzure(message: object, finish_reason = 'tool_calls') {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 0, model: 'gpt-test',
      choices: [{ index: 0, finish_reason, message: { role: 'assistant', refusal: null, content: null, ...message } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { sent, llm: new AzureOpenAILLM('https://test.openai.azure.com/openai/v1/', 'key', 'gpt-test', { fetch, maxRetries: 0 }) };
}

describe('LLM.toolChat (D10, REQ-ASK-10, SEC-ASK-03)', () => {
  it('AC-SEC-ASK-03: the Azure request carries store: false and the tools; tool calls come back raw', async () => {
    const { sent, llm } = fakeAzure({ tool_calls: [{ id: 't1', type: 'function', function: { name: 'overview', arguments: '{}' } }] });
    expect(await llm.toolChat(REQ)).toEqual({ kind: 'tool_calls', calls: [{ id: 't1', name: 'overview', arguments: '{}' }] });
    expect(sent[0]).toMatchObject({ store: false, tools: [{ type: 'function', function: { name: 'overview' } }] });
    expect(sent[0]).not.toHaveProperty('metadata');
  });

  it('a final turn returns its content', async () => {
    const { llm } = fakeAzure({ content: '{"answer":"71.0%","refused":false}' }, 'stop');
    expect(await llm.toolChat(REQ)).toEqual({ kind: 'final', content: '{"answer":"71.0%","refused":false}' });
  });

  it('AC-ASK-10: RECORD=1 saves each turn; the recorded LLM replays it identically and refuses an unseen prompt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rec-'));
    const live: ToolChatLLM = { name: 'live', json: async () => { throw new Error('x'); }, text: async () => '',
      toolChat: async () => ({ kind: 'final', content: '{"answer":"71.0%","refused":false}' }) };
    const first = await new RecordingLLM(live, dir).toolChat(REQ);
    const replay = new RecordedLLM(dir);
    expect(await replay.toolChat(REQ)).toEqual(first);
    expect(await replay.toolChat(REQ)).toEqual(first);
    await expect(replay.toolChat({ ...REQ, system: 'changed' })).rejects.toMatchObject({ kind: 'missing_recording' });
  });
});
