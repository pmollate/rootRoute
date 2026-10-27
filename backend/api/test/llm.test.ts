import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AzureOpenAILLM } from '../src/core/llm/azureOpenai.js';
import { RecordedLLM, RecordingLLM } from '../src/core/llm/recorded.js';
import { type LLM, LLMError } from '../src/core/llm/types.js';

const Schema = z.object({ answer: z.number() });
const fake: LLM = { name: 'fake', json: async () => ({ answer: 42 }) as never, text: async () => 'hello' };

describe('recorded LLM', () => {
  it('replays exactly what RecordingLLM saved', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rec-'));
    const req = { system: 's', user: 'u', schema: Schema };
    await new RecordingLLM(fake, dir).json(req);
    await new RecordingLLM(fake, dir).text({ system: 's', user: 'u' });
    const replay = new RecordedLLM(dir);
    expect(await replay.json(req)).toEqual({ answer: 42 });
    expect(await replay.text({ system: 's', user: 'u' })).toBe('hello');
  });

  it('replays a refusal as a refusal (Prompt Shields on the injection email)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rec-'));
    const refusing: LLM = { name: 'refusing', json: async () => { throw new LLMError('blocked', 'refusal'); }, text: async () => '' };
    const req = { system: 's', user: 'inject', schema: Schema };
    await expect(new RecordingLLM(refusing, dir).json(req)).rejects.toMatchObject({ kind: 'refusal' });
    await expect(new RecordedLLM(dir).json(req)).rejects.toMatchObject({ kind: 'refusal', message: 'blocked' });
  });

  it('does not record a transport error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rec-'));
    const down: LLM = { name: 'down', json: async () => { throw new LLMError('timeout', 'transport'); }, text: async () => '' };
    const req = { system: 's', user: 'u', schema: Schema };
    await expect(new RecordingLLM(down, dir).json(req)).rejects.toMatchObject({ kind: 'transport' });
    await expect(new RecordedLLM(dir).json(req)).rejects.toMatchObject({ kind: 'missing_recording' });
  });

  it('fails with missing_recording for an unseen prompt', async () => {
    const replay = new RecordedLLM(mkdtempSync(join(tmpdir(), 'rec-')));
    await expect(replay.text({ system: 's', user: 'other' })).rejects.toMatchObject({ kind: 'missing_recording' });
  });
});

/** A fake Azure endpoint: keeps each request body and answers with `reply`. */
function fakeAzure(reply: { status?: number; body: object }) {
  const sent: Record<string, unknown>[] = [];
  const fetch = async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  return { sent, llm: new AzureOpenAILLM('https://test.openai.azure.com/openai/v1/', 'key', 'gpt-test', { fetch, maxRetries: 0 }) };
}

const completion = (content: string, finish_reason = 'stop') => ({
  id: 'c1', object: 'chat.completion', created: 0, model: 'gpt-test',
  choices: [{ index: 0, finish_reason, message: { role: 'assistant', content, refusal: null } }],
});

describe('azure openai LLM', () => {
  it('sends a strict schema and low reasoning effort, never temperature', async () => {
    const { sent, llm } = fakeAzure({ body: completion('{"answer":42}') });
    expect(await llm.json({ system: 's', user: 'u', schema: Schema })).toEqual({ answer: 42 });
    expect(sent[0]).toMatchObject({ model: 'gpt-test', reasoning_effort: 'low', response_format: { type: 'json_schema', json_schema: { strict: true } } });
    expect(sent[0]).not.toHaveProperty('temperature');
  });

  it('stores every call in Foundry, tagged by step', async () => {
    const { sent, llm } = fakeAzure({ body: completion('hi') });
    await llm.text({ system: 's', user: 'u', tag: 'reply' });
    await llm.text({ system: 's', user: 'u' });
    expect(sent[0]).toMatchObject({ store: true, metadata: { app: 'latelens', step: 'reply' } });
    expect(sent[1]).toMatchObject({ store: true, metadata: { step: 'untagged' } });
  });

  it('maps a content-filter block to refusal and cut-off output to invalid', async () => {
    const blocked = fakeAzure({ status: 400, body: { error: { code: 'content_filter', message: 'filtered' } } }).llm;
    await expect(blocked.text({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'refusal' });
    const cut = fakeAzure({ body: completion('{"ans', 'length') }).llm;
    await expect(cut.json({ system: 's', user: 'u', schema: Schema })).rejects.toMatchObject({ kind: 'invalid' });
  });
});
