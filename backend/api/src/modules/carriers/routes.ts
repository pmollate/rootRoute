import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { actorOf } from '../../core/auth.js';
import { bearerAuth } from '../../core/bearer.js';
import { config } from '../../core/config.js';
import { query } from '../../core/db/pool.js';
import { carriersApi, recordOrderEvent } from './index.js';
import { FEED_EVENTS, TS } from './orderEvents.js';
import { DELIVERY_ID } from './routeDemo.js';
import { warehouseApi } from '../warehouse/index.js';
import type { Commitment as CommitmentId, Region as RegionId, WarehouseId } from '../../core/contracts.js';
import { recommendFromLane } from './domain.js';
import { buildDeliveryJourney, buildEmailJourney } from './journey.js';
import { backtestRows, deliveryFacts, emailExists, emailFacts, insertOverride, laneRows, routeDemoExamples, routeDemoRow, routeOverruns, tracking } from './queries.js';

const Region = z.enum(['Midwest', 'Northeast', 'Southeast', 'West']);
const Commitment = z.enum(['same_day', 'next_day', 'standard']);
const RecommendBody = z.object({ region: Region, commitment: Commitment, slaClause: z.boolean(), date: z.string().optional() });
// No `user`: the actor is the signed-in person from the verified token (REQ-AUTH-07); a `user` sent anyway is ignored.
const OverrideBody = z.object({ orderRef: z.string().min(1), from: z.string().min(1), to: z.string().min(1), reason: z.string().min(3) });

/** A ts that has the right shape must also be a real date and time (no 2026-02-31, no 99:99). */
const realTs = (s: string) => {
  const [y, mo, d, h, mi] = s.split(/[- :]/).map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return mo >= 1 && mo <= 12 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
    && h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
};
const EventBody = z.object({ event: z.enum(FEED_EVENTS), ts: z.string().regex(TS).refine(realTs).optional() });

// Roles for every route: core/permissions.ts, checked in server.ts before the handler runs (SPEC-auth §4.2).
const routes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { region?: string; commitment?: string; sla?: string } }>('/carriers', async (req, reply) => {
    const region = Region.safeParse(req.query.region ?? 'Northeast');
    const commitment = Commitment.safeParse(req.query.commitment ?? 'next_day');
    if (!region.success || !commitment.success) return reply.code(400).send({ error: 'bad region or commitment' });
    const rows = await laneRows(region.data, commitment.data);
    return { region: region.data, commitment: commitment.data, recommendation: recommendFromLane(rows, req.query.sla === 'true') };
  });

  app.get('/carriers/backtest', async () => backtestRows());

  /** C9a (SPEC §5.18, REQ-ROUTE-06): route overruns by slice, from `route_overruns` (Python). */
  app.get('/routes/overruns', async (_req, reply) => {
    const data = await routeOverruns();
    return data ?? reply.code(503).send({ error: 'route overruns not computed yet: run the pipeline' });
  });

  /** C9c (SPEC §5.19, REQ-RDEMO-04): one delivery's synthetic reordering demo (SD-11). Labs only. */
  app.get('/labs/route-demo', async (_req, reply) => {
    const examples = await routeDemoExamples();
    return examples ? { synthetic: true, examples } : reply.code(503).send({ error: 'route demo not computed yet: run the pipeline' });
  });

  app.get<{ Params: { deliveryId: string } }>('/labs/route-demo/:deliveryId', async (req, reply) => {
    if (!DELIVERY_ID.test(req.params.deliveryId)) return reply.code(400).send({ error: 'bad_delivery_id' });
    const r = await routeDemoRow(req.params.deliveryId);
    if (r === 'no_table') return reply.code(503).send({ error: 'route demo not computed yet: run the pipeline' });
    return r ?? reply.code(404).send({ error: 'not_found' });
  });

  app.get<{ Querystring: { asOf?: string } }>('/tracking', async (req, reply) => {
    const asOf = req.query.asOf ?? '2026-09-10';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return reply.code(400).send({ error: 'asOf must be YYYY-MM-DD' });
    return tracking(asOf);
  });

  app.post('/recommend', async (req, reply) => {
    const body = RecommendBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const rec = await carriersApi.recommendCarrier(body.data);
    const who = actorOf(req);
    await query('INSERT INTO audit_log (actor, action, ref, payload) VALUES ($1,$2,$3,$4)', [who.id, 'recommend',
      `lane:${body.data.region}/${body.data.commitment}`, JSON.stringify({ name: who.name, roles: who.roles, carrier: rec.carrier })]);
    return rec;
  });

  app.post('/overrides', async (req, reply) => {
    const body = OverrideBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    return { id: await insertOverride({ ...body.data, user: actorOf(req).id }) };
  });

  /** Design §6: the simulated WMS and carriers report an order's next step. Its own Bearer token, not a user's. */
  app.post<{ Params: { ref: string } }>('/orders/:ref/events', async (req, reply) => {
    const auth = bearerAuth(req.headers.authorization, config.WMS_EVENTS_TOKEN);
    if (auth !== 200) return reply.code(auth).send({ error: auth === 503 ? 'order events are not set up (WMS_EVENTS_TOKEN)' : 'unauthorized' });
    const m = /^email:(\d+)$/.exec(req.params.ref);
    const body = EventBody.safeParse(req.body);
    if (!m || !body.success) return reply.code(400).send({ error: 'invalid' });
    const emailId = Number(m[1]);
    if (!(await emailExists(emailId))) return reply.code(404).send({ error: 'not found' });
    const r = await recordOrderEvent({ orderRef: `email:${emailId}`, event: body.data.event, ts: body.data.ts });
    req.log.info({ emailId, event: body.data.event, code: r.code }, 'order event');
    return reply.code(r.code).send(r.error ? { error: r.error } : { event: body.data.event, ts: r.ts });
  });

  /** D9 Order journey: `email:<id>` (an intake order) or `delivery:<id>` (a past delivery). Read-only. */
  app.get<{ Params: { ref: string } }>('/journey/:ref', async (req, reply) => {
    const m = /^(email:(\d+)|delivery:(D\d{6}))$/.exec(req.params.ref);
    if (!m) return reply.code(400).send({ error: 'ref must be email:<id> or delivery:D<6 digits>' });
    if (m[2]) {
      const emailId = Number(m[2]);
      req.log.info({ emailId }, 'journey viewed');
      const facts = await emailFacts(emailId);
      return facts ? buildEmailJourney(facts) : reply.code(404).send({ error: 'not found' });
    }
    const deliveryId = m[3];
    req.log.info({ deliveryId }, 'journey viewed');
    const found = await deliveryFacts(deliveryId);
    if (!found) return reply.code(404).send({ error: 'not found' });
    const { row: d, events } = found;
    // The existing rules on this delivery's facts; laneRows + recommendFromLane log nothing (recommendCarrier would).
    const promise = warehouseApi.checkPromise(d.commitment as CommitmentId, d.receivedAt);
    const warehouse = await warehouseApi.pickWarehouse({ destinationRegion: d.region as RegionId,
      nearestWarehouseId: d.nearest as WarehouseId, stock: { [d.nearest]: d.nearestHadStock } });
    const carrier = d.f_bad_lane
      ? recommendFromLane(await laneRows(d.region as RegionId, d.commitment as CommitmentId), d.sla === 'Y').reason : null;
    return buildDeliveryJourney(d, d, events, { promise, warehouse, carrier });
  });
};

export default routes;
