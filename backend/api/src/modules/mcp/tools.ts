// The one registry of read-only LateLens tools (owner C, SPEC §5.14, §5.16 REQ-ASK-02). The MCP server (D7) and the
// in-app assistant (D10) both read TOOLS: same names, descriptions, input schemas and handlers.
// Every tool returns aggregate figures or rules only: no client name, contact, address or email text (SEC-ASK-04).
import { z } from 'zod';
import type { Commitment as CommitmentId, Region as RegionId } from '../../core/contracts.js';
import { recommendFromLane } from '../carriers/domain.js';
import { laneRows, routeOverruns } from '../carriers/queries.js';
import { warehouseApi } from '../warehouse/index.js';
import * as q from '../warehouse/queries.js';

export const TOOL_NAMES = ['overview', 'delivery_causes', 'scenario', 'lane_scores', 'recommend_carrier', 'check_promise',
  'route_overruns'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolDef<I extends z.ZodRawShape = z.ZodRawShape> {
  name: ToolName;
  title: string;
  description: string;
  input: I;               // zod shape; MCP's SDK checks it; so does the assistant before it runs a tool (REQ-ASK-03)
  readOnly: true;
  run(args: z.infer<z.ZodObject<I>>): Promise<unknown>;
}

const REGIONS = ['Midwest', 'Northeast', 'Southeast', 'West'] as const;
const Region = z.enum(REGIONS);
const Commitment = z.enum(['same_day', 'next_day', 'standard']);
const RouteSlice = z.enum(['carrier', 'region', 'warehouse', 'stops_band', 'weekday', 'month']);

/** recommendFromLane, not carriersApi.recommendCarrier: the latter logs a `recommendations` row on every call. */
const lane = async (region: RegionId, commitment: CommitmentId, sla = false) => recommendFromLane(await laneRows(region, commitment), sla);

const tool = <I extends z.ZodRawShape>(t: ToolDef<I>): ToolDef => t as unknown as ToolDef;

export const TOOLS: readonly ToolDef[] = [
  tool({
    name: 'overview', title: 'Headline KPIs', readOnly: true, input: {},
    description: 'On-time rate vs the 94% benchmark, late deliveries, penalty and handling costs, at-risk accounts and '
      + 'their revenue, and the share of late deliveries with a cause before pickup.',
    // Headline KPIs only: the data line (window, warehouse and carrier counts) is for the dashboard shell, and leaving
    // it out keeps the tool's output, and so the recorded answers keyed on it, unchanged.
    run: async () => {
      const { warehouses, carriers, windowFrom, windowTo, recentFrom, ...kpis } = await q.overview();
      void [warehouses, carriers, windowFrom, windowTo, recentFrom];
      return kpis;
    },
  }),
  tool({
    name: 'delivery_causes', title: 'Why deliveries are late', readOnly: true,
    description: 'For each of the five causes (incomplete address, cut-off, non-nearest warehouse, carrier lane, route '
      + 'detour): deliveries affected and their late rate, for all orders, email orders or at-risk accounts.',
    input: { segment: z.enum(q.SEGMENTS).default('all') },
    run: async ({ segment }) => q.causes(segment),
  }),
  tool({
    name: 'scenario', title: 'What-if replay', readOnly: true,
    description: 'On-time rate if causes were fixed, replayed over every delivery: today, route detours only '
      + '(route_only), Root Route as built (as_built_adopted), the full programme (adopt_all) and more.',
    input: { segment: z.enum(q.REPLAY_SEGMENTS).default('all') },
    run: async ({ segment }) => q.replay(segment),
  }),
  tool({
    name: 'lane_scores', title: 'Carrier lanes', readOnly: true,
    description: 'Without arguments: the carrier lanes Root Route blocks, with the reason for each, and carrier D\'s '
      + 'Friday capacity cap. With region and '
      + 'commitment: every carrier on that lane, with on-time rate on fair data, cost and status.',
    input: { region: Region.optional(), commitment: Commitment.optional() },
    run: async ({ region, commitment }) => {
      if (region && commitment) return lane(region, commitment);
      // A block holds for every promise on the lane, so one call per region finds them all (as the Carriers screen does).
      const blocked = (await Promise.all(REGIONS.map(async (r) => (await lane(r, 'standard')).options
        .filter((o) => o.status === 'blocked')
        .map((o) => ({ lane: `${o.carrier} → ${r}`, carrier: o.carrier, region: r, reason: o.reason })))))
        .flat().sort((a, b) => a.lane.localeCompare(b.lane));
      return { blocked, note: 'Carrier D is also capped on Fridays at its normal daily level (a capacity limit, not a block).' };
    },
  }),
  tool({
    name: 'recommend_carrier', title: 'Recommend a carrier', readOnly: true,
    description: 'The carrier Root Route would book for an order, with a backup and the reason.',
    input: { region: Region, commitment: Commitment, slaClause: z.boolean().default(false) },
    run: async ({ region, commitment, slaClause }) => lane(region, commitment, slaClause),
  }),
  tool({
    name: 'check_promise', title: 'Check a delivery promise', readOnly: true,
    description: 'The delivery date Halcyon can keep for an order received at a local time (08:00 pick-list cut-off).',
    input: { commitment: Commitment, receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).describe('YYYY-MM-DD HH:mm') },
    run: async ({ commitment, receivedAt }) => warehouseApi.checkPromise(commitment, receivedAt),
  }),
  tool({
    name: 'route_overruns', title: 'Route overruns', readOnly: true,
    description: 'Deliveries whose actual route ran more than 20% over plan: count, overrun rate, late rate with and '
      + 'without an overrun, penalty and handling cost, and deliveries with no route distance; overall and by carrier, '
      + 'region, warehouse, stops on route, shipping weekday or order month, with any value that stands out. '
      + 'Rates are fractions. Diagnostic only: Root Route does not plan or optimise routes. Only for routes driven '
      + 'over plan: for carrier lanes, carrier on-time rates or carrier D on Fridays, use lane_scores.',
    input: { slice: RouteSlice.optional() },
    run: async ({ slice }) => {
      const data = await routeOverruns();
      if (!data) throw new Error('route_overruns: table is empty (run the pipeline)');
      return slice ? { ...data, slices: data.slices.filter((x) => x.slice === slice) } : data;
    },
  }),
];

export const toolByName = (name: string): ToolDef | undefined => TOOLS.find((t) => t.name === name);

/** The JSON schema of a tool's input, as sent to the model (CONTRACTS §1.1 ToolChatRequest.tools). */
export const toolParameters = (t: ToolDef): object => z.toJSONSchema(z.object(t.input), { io: 'input' });

/** Runs a tool on arguments from the model: checked against the tool's input first, so a bad value never reaches a query. */
export async function runTool(t: ToolDef, raw: unknown): Promise<unknown> {
  const args = z.object(t.input).safeParse(raw ?? {});
  if (!args.success) throw new Error(`${t.name}: ${args.error.issues.map((i) => `${i.path.join('.') || 'arguments'} ${i.message}`).join('; ')}`);
  return t.run(args.data as never);
}
