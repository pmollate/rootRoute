// D7 "Ask LateLens" (owner C, SPEC §5.14): read-only LateLens tools over MCP, so leadership can ask from an MCP client.
// The tools return the same figures as the dashboard (REQ-MCP-03); none sends email, approves or writes (REQ-MCP-01).
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Commitment as CommitmentId, Region as RegionId } from '../../core/contracts.js';
import { recommendFromLane } from '../carriers/domain.js';
import { laneRows } from '../carriers/queries.js';
import { warehouseApi } from '../warehouse/index.js';
import * as q from '../warehouse/queries.js';

const REGIONS = ['Midwest', 'Northeast', 'Southeast', 'West'] as const;
const Region = z.enum(REGIONS);
const Commitment = z.enum(['same_day', 'next_day', 'standard']);
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });

/** recommendFromLane, not carriersApi.recommendCarrier: the latter logs a `recommendations` row on every call. */
const lane = async (region: RegionId, commitment: CommitmentId, sla = false) => recommendFromLane(await laneRows(region, commitment), sla);

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'ask-latelens', version: '1.0.0' }, {
    instructions: 'Halcyon delivery diagnostics from the supplied dataset (48,340 deliveries, Apr–Sep 2026). '
      + 'Quote only figures returned by these tools; rates are fractions (0.71 = 71%).',
  });

  server.registerTool('overview', {
    title: 'Headline KPIs',
    description: 'On-time rate vs the 94% benchmark, late deliveries, penalty and handling costs, at-risk accounts.',
    annotations: READ_ONLY,
  }, async () => json(await q.overview()));

  server.registerTool('delivery_causes', {
    title: 'Why deliveries are late',
    description: 'For each of the five causes (incomplete address, cut-off, non-nearest warehouse, carrier lane, route '
      + 'detour): deliveries affected and their late rate, for all orders, email orders or at-risk accounts.',
    inputSchema: { segment: z.enum(q.SEGMENTS).default('all') },
    annotations: READ_ONLY,
  }, async ({ segment }) => json(await q.causes(segment)));

  server.registerTool('scenario', {
    title: 'What-if replay',
    description: 'On-time rate if causes were fixed, replayed over every delivery: today, route detours only '
      + '(route_only), LateLens as built (as_built_adopted), the full programme (adopt_all) and more.',
    inputSchema: { segment: z.enum(q.REPLAY_SEGMENTS).default('all') },
    annotations: READ_ONLY,
  }, async ({ segment }) => json(await q.replay(segment)));

  server.registerTool('lane_scores', {
    title: 'Carrier lanes',
    description: 'Without arguments: the carrier lanes LateLens blocks, with the reason for each. With region and '
      + 'commitment: every carrier on that lane, with on-time rate on fair data, cost and status.',
    inputSchema: { region: Region.optional(), commitment: Commitment.optional() },
    annotations: READ_ONLY,
  }, async ({ region, commitment }) => {
    if (region && commitment) return json(await lane(region, commitment));
    // A block holds for every promise on the lane, so one call per region finds them all (as the Carriers screen does).
    const blocked = (await Promise.all(REGIONS.map(async (r) => (await lane(r, 'standard')).options
      .filter((o) => o.status === 'blocked')
      .map((o) => ({ lane: `${o.carrier} → ${r}`, carrier: o.carrier, region: r, reason: o.reason })))))
      .flat().sort((a, b) => a.lane.localeCompare(b.lane));
    return json({ blocked, note: 'Carrier D is also capped on Fridays at its normal daily level (a capacity limit, not a block).' });
  });

  server.registerTool('recommend_carrier', {
    title: 'Recommend a carrier',
    description: 'The carrier LateLens would book for an order, with a backup and the reason.',
    inputSchema: { region: Region, commitment: Commitment, slaClause: z.boolean().default(false) },
    annotations: READ_ONLY,
  }, async ({ region, commitment, slaClause }) => json(await lane(region, commitment, slaClause)));

  server.registerTool('check_promise', {
    title: 'Check a delivery promise',
    description: 'The delivery date Halcyon can keep for an order received at a local time (08:00 pick-list cut-off).',
    inputSchema: { commitment: Commitment, receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).describe('YYYY-MM-DD HH:mm') },
    annotations: READ_ONLY,
  }, async ({ commitment, receivedAt }) => json(warehouseApi.checkPromise(commitment, receivedAt)));

  return server;
}

/** REQ-MCP-02: `Authorization: Bearer <MCP_TOKEN>`. No token configured means the endpoint is off, never open. */
export function mcpAuth(header: string | undefined, token: string | undefined): 200 | 401 | 503 {
  if (!token) return 503;
  const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '');
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want) ? 200 : 401;
}
