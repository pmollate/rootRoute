import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { buildMcpServer, mcpAuth } from '../src/modules/mcp/server.js';

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([buildMcpServer().connect(a), client.connect(b)]);
  return client;
}

describe('Ask LateLens MCP server (D7)', () => {
  it('AC-MCP-01: lists only read-only tools, each marked read-only', async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['check_promise', 'delivery_causes', 'lane_scores', 'overview', 'recommend_carrier', 'route_overruns', 'scenario']);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(t.description).toBeTruthy();
    }
    expect(tools.map((t) => t.name).join(' ')).not.toMatch(/send|approve|write|delete|update|reply|override/);
  });

  it('check_promise answers from the cut-off rule (no database needed)', async () => {
    const r = await (await connect()).callTool({ name: 'check_promise', arguments: { commitment: 'same_day', receivedAt: '2026-10-28 09:15' } });
    const out = JSON.parse((r.content as { text: string }[])[0].text);
    expect(out).toMatchObject({ promiseDate: '2026-10-30', commitment: 'next_day', downgraded: true });
    expect(out.reason).toMatch(/after the 08:00 pick-list cut-off/);
  });

  it('rejects bad input instead of guessing', async () => {
    const r = await (await connect()).callTool({ name: 'check_promise', arguments: { commitment: 'tomorrow', receivedAt: 'soon' } });
    expect(r.isError).toBe(true);
  });
});

describe('MCP token (REQ-MCP-02)', () => {
  const token = 'a'.repeat(32);
  it('AC-MCP-02: refuses a missing or wrong token, accepts the right one', () => {
    expect(mcpAuth({}, token)).toBe(401);
    expect(mcpAuth({ authorization: 'Bearer wrong' }, token)).toBe(401);
    expect(mcpAuth({ authorization: `Basic ${token}` }, token)).toBe(401);
    expect(mcpAuth({ authorization: `Bearer ${token}` }, token)).toBe(200);
  });
  it('AC-MCP-02: accepts the same token in x-api-key, for clients that keep Authorization for their own OAuth', () => {
    expect(mcpAuth({ 'x-api-key': token }, token)).toBe(200);
    expect(mcpAuth({ authorization: 'Bearer their-oauth-token', 'x-api-key': token }, token)).toBe(200);
    expect(mcpAuth({ 'x-api-key': 'wrong' }, token)).toBe(401);
    expect(mcpAuth({ 'x-api-key': [token, token] }, token)).toBe(401);
  });
  it('AC-MCP-02: accepts the token in the URL path (claude.ai connectors take a URL, no headers); the path wins', () => {
    expect(mcpAuth({}, token, token)).toBe(200);
    expect(mcpAuth({}, token, 'wrong')).toBe(401);
    expect(mcpAuth({ authorization: `Bearer ${token}` }, token, 'wrong')).toBe(401);
    expect(mcpAuth({}, undefined, token)).toBe(503);
  });
  it('is switched off (503) when no token is configured, so it is never open by accident', () => {
    expect(mcpAuth({ authorization: `Bearer ${token}` }, undefined)).toBe(503);
    expect(mcpAuth({ 'x-api-key': token }, undefined)).toBe(503);
  });
});
