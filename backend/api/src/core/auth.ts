import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';

/** preHandler for write endpoints: requires the shared demo key in x-api-key. */
export async function requireApiKey(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (req.headers['x-api-key'] !== config.API_KEY) {
    await reply.code(401).send({ error: 'unauthorized' });
  }
}
