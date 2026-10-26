import type { FastifyPluginAsync } from 'fastify';
import * as q from './queries.js';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async () => q.overview());

  app.get<{ Querystring: { segment?: string } }>('/causes', async (req, reply) => {
    const segment = req.query.segment ?? 'all';
    if (!(q.SEGMENTS as readonly string[]).includes(segment)) return reply.code(400).send({ error: `segment must be one of ${q.SEGMENTS.join(', ')}` });
    return q.causes(segment);
  });

  app.get<{ Querystring: { segment?: string } }>('/replay', async (req, reply) => {
    const segment = req.query.segment ?? 'all';
    if (!(q.REPLAY_SEGMENTS as readonly string[]).includes(segment)) return reply.code(400).send({ error: `segment must be one of ${q.REPLAY_SEGMENTS.join(', ')}` });
    return q.replay(segment);
  });

  app.get('/accounts', async () => q.accounts());
  app.get('/attribution', async () => q.attribution());
  app.get('/cause-kpis', async () => q.causeKpis());
  app.get('/warehouses', async () => q.warehouses());
  app.get('/penalties/unpaid', async () => q.unpaidPenalties());
  app.get('/placement', async () => q.placement());
};

export default routes;
