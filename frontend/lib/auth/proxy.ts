import { signInternalToken } from './internalToken';
import { authLog } from './log';
import type { SessionUser } from './roles';

export interface ProxySettings {
  required: boolean;        // AUTH_REQUIRED=on
  apiUrl: string;           // API_URL: the Fastify base URL, server-side only
  appOrigin: string;        // the app's own origin (AUTH_URL), the only Origin a write may come from
  internalSecret?: string;  // INTERNAL_AUTH_SECRET
  apiKey?: string;          // API_KEY: added by the server, only with AUTH_REQUIRED=off and no session (REQ-AUTH-13)
}

export interface ProxyDeps {
  session: SessionUser | null;
  settings: ProxySettings;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
}

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** One path segment as the browser sent it: no `.`/`..`, no slash or backslash, even encoded (SEC-AUTH-08). */
function cleanSegment(seg: string): string | null {
  let s: string;
  try {
    s = decodeURIComponent(seg);
  } catch {
    return null;
  }
  if (!s || s === '.' || s === '..' || /[/\\\u0000-\u001f]/.test(s)) return null;
  return encodeURIComponent(s).replace(/%3A/gi, ':'); // journey refs are `delivery:D000213`
}

/**
 * The browser's only way to the API (SPEC-auth §5.1): same-origin `/api/*` → API_URL + the same path, GET and POST only
 * (the route file exports nothing else). Checks the session, refuses a cross-site write, drops the browser's
 * Authorization, x-api-key and Cookie headers, and adds a fresh 60 s internal token.
 */
export async function proxy(req: Request, segments: string[], { session, settings, fetch }: ProxyDeps): Promise<Response> {
  const parts = segments.map(cleanSegment);
  if (parts.some((p) => p === null)) return json(400, { error: 'bad_path' });
  const path = `/api/${parts.join('/')}`;
  const route = `${req.method} ${path}`;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (!origin || origin !== settings.appOrigin) {
      authLog('auth_bad_origin', { user: session?.id ?? null, route, status: 403 });
      return json(403, { error: 'bad_origin' });
    }
  }
  if (settings.required && !session) {
    authLog('auth_unauthorized', { route, status: 401 });
    return json(401, { error: 'session_expired' });
  }

  const headers = new Headers({ accept: 'application/json' });
  const type = req.headers.get('content-type');
  if (type) headers.set('content-type', type);
  if (session && settings.internalSecret) {
    headers.set('authorization', `Bearer ${await signInternalToken(session, settings.internalSecret)}`);
  } else if (!settings.required && settings.apiKey) {
    headers.set('x-api-key', settings.apiKey);
  }

  const search = new URL(req.url).search;
  const res = await fetch(`${settings.apiUrl.replace(/\/$/, '')}${path}${search}`, {
    method: req.method, headers, body: req.method === 'POST' ? await req.text() : undefined, cache: 'no-store',
  });
  // Only the body and its type go back: no API headers (cookies, server, CORS) reach the browser.
  return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
}
