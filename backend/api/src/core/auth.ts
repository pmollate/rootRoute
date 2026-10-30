import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
import { config } from './config.js';
import { ROLES, type AuthUser, type Role } from './contracts.js';
import { permissionFor, rolesFor } from './permissions.js';
import { redactLink } from './redactLink.js';

/** SPEC-auth §5.2: the web app signs a 60 s HS256 token per request; the API allows 5 s of clock difference. */
export const TOKEN = { issuer: 'latelens-web', audience: 'latelens-api', maxLifeSeconds: 60, clockToleranceSeconds: 5 } as const;
/** The Gmail poll and SEC-06 automatic replies: no person, no role (SEC-AUTH-10). */
export const SYSTEM_INTAKE = 'system:intake';
/** The actor before P7, when the shared key was used and no person was known (AUTH_REQUIRED=off only). */
const LEGACY_ACTOR = 'ops';

export interface AuthSettings {
  required: boolean;  // AUTH_REQUIRED=on
  secret?: string;    // INTERNAL_AUTH_SECRET
  apiKey?: string;    // API_KEY, honoured only when not required (REQ-AUTH-13)
}

declare module 'fastify' {
  interface FastifyInstance {
    /** buildApp's AUTH_REQUIRED (tests pass their own), for routes whose behaviour depends on it. */
    authRequired: boolean;
  }
  interface FastifyRequest {
    /** The verified caller; with AUTH_REQUIRED=off, the shared-key caller as before P7. Null on open reads. */
    user: AuthUser | null;
  }
}

export const authSettings = (): AuthSettings =>
  ({ required: config.AUTH_REQUIRED === 'on', secret: config.INTERNAL_AUTH_SECRET, apiKey: config.API_KEY });

/** SEC-AUTH-09: fail closed. Names the setting, never its value. */
export function checkAuthSettings(s: AuthSettings): void {
  if (!s.required) return;
  if (!s.secret || Buffer.byteLength(s.secret) < 32) {
    throw new Error('INTERNAL_AUTH_SECRET is missing or shorter than 32 bytes, and AUTH_REQUIRED=on: refusing to start');
  }
}

const isRole = (r: unknown): r is Role => typeof r === 'string' && (ROLES as readonly string[]).includes(r);

/** SEC-AUTH-03: HS256 with our secret, our iss and aud, a life of at most 60 s. Anything else is null. */
export async function verifyToken(token: string, secret: string): Promise<AuthUser | null> {
  try {
    const { payload: p } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'], issuer: TOKEN.issuer, audience: TOKEN.audience,
      clockTolerance: TOKEN.clockToleranceSeconds, requiredClaims: ['sub', 'iat', 'exp'],
    });
    if (p.exp! - p.iat! > TOKEN.maxLifeSeconds) return null;
    const roles = Array.isArray(p.roles) ? [...new Set(p.roles.filter(isRole))] : [];
    return { id: p.sub!, name: typeof p.name === 'string' ? p.name : p.sub!, roles, demo: p.sub!.startsWith('demo:') };
  } catch {
    return null;
  }
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

type Outcome = { ok: true } | { ok: false; status: 401 | 403; error: 'unauthorized' | 'forbidden' };

/** What AUTH_REQUIRED=on decides: no valid token → 401; a role outside the list (or no list: default deny) → 403. */
function decide(user: AuthUser | null, roles: readonly Role[] | null): Outcome {
  if (!user) return { ok: false, status: 401, error: 'unauthorized' };
  if (!roles || !user.roles.some((r) => roles.includes(r))) return { ok: false, status: 403, error: 'forbidden' };
  return { ok: true };
}

/**
 * preHandler for every route (registered once in server.ts, so a new route is covered without a change): looks up the
 * route and action in permissions.ts and checks the caller's token against it (REQ-AUTH-04 to -07).
 * With AUTH_REQUIRED=off it logs what `on` would refuse (auth_would_deny) and keeps the x-api-key check as before.
 */
export function requireUser(s: AuthSettings) {
  return async function authorize(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    req.user = null;
    const url = req.routeOptions.url;
    const roles = rolesFor(req.method, url, req.body);
    if (roles === 'public') return;
    const route = `${req.method} ${url ?? redactLink(req.url.split('?')[0])}`; // SEC-LINK-01: no token in a log line
    const token = bearer(req);
    const user = token && s.secret ? await verifyToken(token, s.secret) : null;
    const outcome = decide(user, roles);

    if (s.required) {
      if (!outcome.ok) {
        req.log.warn({ event: outcome.status === 401 ? 'auth_unauthorized' : 'auth_forbidden', user: user?.id, route },
          'auth refused');
        await reply.code(outcome.status).send({ error: outcome.error });
        return;
      }
      req.user = user;
      return;
    }

    // AUTH_REQUIRED=off: behave as before P7 (REQ-AUTH-13).
    if (!outcome.ok) req.log.info({ event: 'auth_would_deny', user: user?.id, route, status: outcome.status }, 'auth would deny');
    const p = permissionFor(req.method, url);
    const keyed = p !== null && p !== 'public' && p.legacyKey === true;
    if (keyed && (!s.apiKey || req.headers['x-api-key'] !== s.apiKey)) {
      await reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    if (user) req.user = user;
    else if (keyed) {
      const named = (req.body as { user?: unknown } | null | undefined)?.user;
      const id = typeof named === 'string' && named.trim() ? named : LEGACY_ACTOR;
      req.user = { id, name: id, roles: [], demo: false };
    }
  };
}

/** The actor for a write: the signed-in user, or (only with AUTH_REQUIRED=off on an open route) 'anonymous'. */
export const actorOf = (req: FastifyRequest): AuthUser => req.user ?? { id: 'anonymous', name: 'anonymous', roles: [], demo: false };
