import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './core/config.js';
import { dbOk } from './core/db/pool.js';
import { registerModules } from './core/modules.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' });
  await app.register(cors, { origin: true });
  app.get('/api/health', async () => ({
    db: (await dbOk()) ? 'ok' : 'down',
    llm: config.LLM_PROVIDER,
    version: process.env.GIT_SHA ?? 'dev',
  }));
  await registerModules(app);
  return app;
}
