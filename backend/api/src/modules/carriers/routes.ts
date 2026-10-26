import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireApiKey } from '../../core/auth.js';
import { carriersApi } from './index.js';
import { recommendFromLane } from './domain.js';
import { backtestRows, insertOverride, laneRows, tracking } from './queries.js';

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
};

export default routes;
