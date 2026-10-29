import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { type AuthSettings, authSettings, checkAuthSettings, requireUser } from './core/auth.js';
import { config } from './core/config.js';
import { dbOk } from './core/db/pool.js';
import { registerModules } from './core/modules.js';

export interface BuildOptions {
  /** Defaults to AUTH_REQUIRED, INTERNAL_AUTH_SECRET and API_KEY from the environment; tests pass their own. */
  auth?: Partial<AuthSettings>;
  /** Tests: collect the JSON log lines (the auth_* events). */
  logStream?: { write(line: string): void };
  /** Tests: every registered route, to compare with core/permissions.ts (AC-AUTH-06). */
  onRoute?: (method: string, url: string) => void;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const auth = { ...authSettings(), ...opts.auth };
  checkAuthSettings(auth); // SEC-AUTH-09: fail closed before anything listens
  const app = Fastify({ logger: opts.logStream ? { stream: opts.logStream } : config.NODE_ENV !== 'test' });
  if (opts.onRoute) {
    const seen = opts.onRoute;
    app.addHook('onRoute', (r) => {
      for (const m of [r.method].flat()) if (m !== 'HEAD' && m !== 'OPTIONS') seen(m, r.url);
    });
  }
  // Before P7 the browser called the API directly. Once enforced, only the web app's proxy does (SEC-AUTH-13).
  if (!auth.required) await app.register(cors, { origin: true });
  app.decorateRequest('user', null);
  app.addHook('preHandler', requireUser(auth)); // every route, including ones added later: default deny (REQ-AUTH-06)
  app.get('/api/health', async () => ({
    db: (await dbOk()) ? 'ok' : 'down',
    llm: config.LLM_PROVIDER,
    version: process.env.GIT_SHA ?? 'dev',
  }));
  await registerModules(app);
  return app;
}
