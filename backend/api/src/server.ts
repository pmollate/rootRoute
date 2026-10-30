import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
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

/**
 * REQ-INT-16: a request the API cannot read (too large, not JSON, broken JSON) gets one readable sentence in the same
 * `{ error, fields }` shape as a refused field, instead of Fastify's default. Any other error goes on to Fastify's default
 * handler unchanged.
 */
export function bodyErrors(bodyLimit: number) {
  const mb = Math.round((bodyLimit / 1048576) * 10) / 10;
  const messages: Record<string, string> = {
    FST_ERR_CTP_BODY_TOO_LARGE: `The request is larger than ${mb} MB. Paste only the text of one email.`,
    FST_ERR_CTP_INVALID_MEDIA_TYPE: 'Send the request as JSON (Content-Type: application/json).',
    FST_ERR_CTP_INVALID_JSON_BODY: 'The request is not valid JSON.',
    FST_ERR_CTP_EMPTY_JSON_BODY: 'The request is not valid JSON.',
    FST_ERR_CTP_INVALID_CONTENT_LENGTH: 'The request was cut off. Send it again.',
  };
  return (err: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
    const error = err.code ? messages[err.code] : undefined;
    if (!error) throw err; // Fastify's default handler
    return reply.code(err.statusCode ?? 400).send({ error, fields: {} });
  };
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
  app.setErrorHandler(bodyErrors(app.initialConfig.bodyLimit ?? 1048576));
  app.decorate('authRequired', auth.required);
  app.decorateRequest('user', null);
  app.addHook('preHandler', requireUser(auth)); // every route, including ones added later: default deny (REQ-AUTH-06)
  app.get('/api/health', async () => ({
    db: (await dbOk()) ? 'ok' : 'down',
    llm: config.LLM_PROVIDER,
    version: process.env.GIT_SHA ?? 'dev',
  }));
  // MCP clients look for OAuth before connecting; /api/mcp has its own token, so say there is none (404, not 401).
  app.get('/.well-known/*', async (_req, reply) => reply.code(404).send({ error: 'not found' }));
  await registerModules(app);
  return app;
}
