import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { actorOf } from '../../core/auth.js';
import { autoAdvanceOn, setAutoAdvance } from './repo.js';

const AutoAdvanceBody = z.object({ enabled: z.boolean() }).strict();

// Roles for every route: core/permissions.ts, checked in server.ts before the handler runs (SPEC-auth §4.2).
const routes: FastifyPluginAsync = async (app) => {
  app.get('/settings', async () => ({ autoAdvance: await autoAdvanceOn() }));

  app.post('/settings/auto-advance', async (req, reply) => {
    const body = AutoAdvanceBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'enabled must be true or false' });
    await setAutoAdvance(body.data.enabled, actorOf(req));
    req.log.info({ setting: 'auto_advance', enabled: body.data.enabled }, 'setting changed');
    return { autoAdvance: body.data.enabled };
  });
};

export default routes;
