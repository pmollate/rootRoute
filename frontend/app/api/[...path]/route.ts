import { proxy } from '@/lib/auth/proxy';
import { currentUser, proxySettings } from '@/lib/auth/session';

/**
 * Same-origin `/api/*` for the browser (SPEC-auth §5.1): forwards to the Fastify API with a fresh internal token.
 * Only GET and POST are exported, so any other method gets 405 here (SEC-AUTH-08). /api/auth/* is Auth.js's own route.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx): Promise<Response> {
  const { path } = await params;
  return proxy(req, path, { session: await currentUser(), settings: proxySettings(req), fetch });
}

export { handle as GET, handle as POST };
