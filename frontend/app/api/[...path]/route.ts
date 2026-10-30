import { type ProxySettings, proxy } from '@/lib/auth/proxy';
import { authRequired, currentUser } from '@/lib/auth/session';
import { apiUrl } from '@/lib/apiUrl';

/**
 * Same-origin `/api/*` for the browser (SPEC-auth §5.1): forwards to the Fastify API with a fresh internal token.
 * Only GET and POST are exported, so any other method gets 405 here (SEC-AUTH-08). /api/auth/* is Auth.js's own route.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Server-only settings. Until step 7 retires them, API_URL and API_KEY fall back to the old NEXT_PUBLIC_ build values,
 * so a build deployed before the new app settings exist keeps working; they are read here, never in browser code.
 */
function proxySettings(req: Request): ProxySettings {
  return {
    required: authRequired(),
    apiUrl: apiUrl(),
    appOrigin: process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : new URL(req.url).origin,
    internalSecret: process.env.INTERNAL_AUTH_SECRET || undefined,
    apiKey: process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || undefined,
  };
}

async function handle(req: Request, { params }: Ctx): Promise<Response> {
  const { path } = await params;
  return proxy(req, path, { session: await currentUser(), settings: proxySettings(req), fetch });
}

export { handle as GET, handle as POST };
