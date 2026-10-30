import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';
import { AUTH_ON } from '../token.js';
import { logRecommendation } from '../../src/modules/carriers/queries.js';

// Spy on the one function that writes `recommendations`; other test files write that table in parallel, so counting
// rows would be racy.
vi.mock('../../src/modules/carriers/queries.js', async (original) => ({
  ...(await original<typeof import('../../src/modules/carriers/queries.js')>()), logRecommendation: vi.fn(),
}));

const HEADERS = { accept: 'application/json, text/event-stream', 'content-type': 'application/json' };
const auth = { ...HEADERS, authorization: `Bearer ${process.env.MCP_TOKEN}` };
const call = (name: string, args: object) =>
  ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });

describe.skipIf(!hasDb)('MCP route (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());

  const tool = async (name: string, args: object = {}) => {
    const res = await app.inject({ method: 'POST', url: '/api/mcp', headers: auth, payload: call(name, args) });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.json().result.content[0].text);
  };

  it('AC-MCP-02: refuses requests without the token, or with the dashboard API key', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/mcp', headers: HEADERS, payload: call('overview', {}) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/mcp', headers: { ...HEADERS, 'x-api-key': 'test-key' },
      payload: call('overview', {}) })).statusCode).toBe(401);
  });

  it('AC-MCP-02: accepts the token in x-api-key (claude.ai custom connectors)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/mcp',
      headers: { ...HEADERS, 'x-api-key': process.env.MCP_TOKEN }, payload: call('check_promise',
        { commitment: 'next_day', receivedAt: '2026-10-28 07:15' }) });
    expect(res.statusCode).toBe(200);
  });

  it('answers the probes an MCP client makes before connecting, with sign-in enforced: 405 for GET and DELETE, 404 for OAuth discovery', async () => {
    const on = await buildApp({ auth: AUTH_ON });
    for (const method of ['GET', 'DELETE'] as const) {
      const res = await on.inject({ method, url: '/api/mcp' });
      expect(res.statusCode, method).toBe(405);
      expect(res.headers.allow).toBe('POST');
    }
    for (const url of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp',
      '/.well-known/oauth-authorization-server']) {
      expect((await on.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
    expect((await on.inject({ method: 'POST', url: '/api/mcp', headers: HEADERS, payload: call('overview', {}) })).statusCode).toBe(401);
    await on.close();
  });

  it('AC-MCP-03: lane_scores names the five blocked lanes with their reasons', async () => {
    const out = await tool('lane_scores');
    expect(out.blocked.map((b: { lane: string }) => b.lane)).toEqual(
      ['D → Midwest', 'D → Southeast', 'E → West', 'F → Northeast', 'F → Southeast']);
    for (const b of out.blocked) expect(b.reason).toMatch(/late on fair data/);
  });

  it('scenario gives the same figures as the Replay screen: today 71.0%, as built 85.9%, programme 92.0%', async () => {
    const out = await tool('scenario', { segment: 'all' });
    const on = (key: string) => out.scenarios.find((s: { scenario: string }) => s.scenario === key).onTime;
    expect(on('today')).toBeCloseTo(0.71, 3);
    expect(on('as_built_adopted')).toBeCloseTo(0.859, 3);
    expect(on('adopt_all')).toBeCloseTo(0.92, 3);
  });

  it('overview and recommend_carrier answer, and nothing is logged as a recommendation', async () => {
    expect((await tool('overview')).deliveries).toBe(48340);
    const rec = await tool('recommend_carrier', { region: 'Northeast', commitment: 'next_day', slaClause: false });
    expect(rec.reason).toMatch(/^Carrier E for Northeast next-day/);
    expect(logRecommendation).not.toHaveBeenCalled();
  });
});
