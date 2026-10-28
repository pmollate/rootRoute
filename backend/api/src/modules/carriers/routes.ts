import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireApiKey } from '../../core/auth.js';
import { carriersApi } from './index.js';
import { warehouseApi } from '../warehouse/index.js';
import type { Commitment as CommitmentId, Region as RegionId, WarehouseId } from '../../core/contracts.js';
import { recommendFromLane } from './domain.js';
import { buildDeliveryJourney, buildEmailJourney } from './journey.js';
import { backtestRows, deliveryFacts, emailFacts, insertOverride, laneRows, tracking } from './queries.js';

const Region = z.enum(['Midwest', 'Northeast', 'Southeast', 'West']);
const Commitment = z.enum(['same_day', 'next_day', 'standard']);
const RecommendBody = z.object({ region: Region, commitment: Commitment, slaClause: z.boolean(), date: z.string().optional() });
const OverrideBody = z.object({ orderRef: z.string().min(1), from: z.string().min(1), to: z.string().min(1), reason: z.string().min(3), user: z.string().min(1) });

const routes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { region?: string; commitment?: string; sla?: string } }>('/carriers', async (req, reply) => {
    const region = Region.safeParse(req.query.region ?? 'Northeast');
    const commitment = Commitment.safeParse(req.query.commitment ?? 'next_day');
    if (!region.success || !commitment.success) return reply.code(400).send({ error: 'bad region or commitment' });
    const rows = await laneRows(region.data, commitment.data);
    return { region: region.data, commitment: commitment.data, recommendation: recommendFromLane(rows, req.query.sla === 'true') };
  });

  app.get('/carriers/backtest', async () => backtestRows());

  app.get<{ Querystring: { asOf?: string } }>('/tracking', async (req, reply) => {
    const asOf = req.query.asOf ?? '2026-09-10';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return reply.code(400).send({ error: 'asOf must be YYYY-MM-DD' });
    return tracking(asOf);
  });

  app.post('/recommend', async (req, reply) => {
    const body = RecommendBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    return carriersApi.recommendCarrier(body.data);
  });

  app.post('/overrides', { preHandler: requireApiKey }, async (req, reply) => {
    const body = OverrideBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    return { id: await insertOverride(body.data) };
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
