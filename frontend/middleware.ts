import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { auth, clientIp } from '@/auth';
import { RateLimiter } from '@/lib/auth/demo';
import { LINK_HEADERS, linkGate, linkRoutePattern } from '@/lib/auth/linkGate';
import { authLog } from '@/lib/auth/log';
import { isOpen } from '@/lib/auth/open';
import { internalUrl } from '@/lib/auth/rewrite';
import { canOpen, toRoles } from '@/lib/auth/roles';

/** E19 (SEC-LINK-04): requests per minute per client IP to /confirm/* and /api/confirm/*, in this process's memory. */
const linkLimiter = new RateLimiter(Number(process.env.CONFIRM_LINK_RATE_PER_MINUTE) || 10);

/**
 * P7 (SPEC-auth §5.1): no session → /login?next=<path>; signed in with no LateLens role → /no-access (REQ-AUTH-03).
 * Auth.js hands the callback a request rebuilt on AUTH_URL's origin (https behind App Service, while Next sees http),
 * so the 403 rewrite is built from the original request: same origin, served internally, status kept.
 */
const requireSession = (orig: NextRequest, ev: NextFetchEvent) => auth((req) => {
  const path = req.nextUrl.pathname;
  if (isOpen(path, process.env.CONFIRM_LINK === 'on')) return NextResponse.next();
  if (!req.auth?.user) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', path + req.nextUrl.search);
    return NextResponse.redirect(login);
  }
  const roles = toRoles(req.auth.user.roles);
  if (roles.length === 0) return NextResponse.redirect(new URL('/no-access', req.url));
  // REQ-AUTH-15: a screen outside the role's page matrix answers 403 with the forbidden page, keeping the URL.
  if (!canOpen(roles, path)) {
    authLog('auth_forbidden', { user: req.auth.user.id, route: path, status: 403 });
    return NextResponse.rewrite(internalUrl(orig, '/dashboard/forbidden'), { status: 403 });
  }
  return NextResponse.next();
// Auth.js types its wrapper for route handlers; as middleware it takes (request, event) like Next's own export.
})(orig, ev as never);

/** MAINTENANCE_MODE=true in .env serves the maintenance page (503) on every route; it takes precedence over sign-in. */
export async function middleware(req: NextRequest, ev: NextFetchEvent) {
  const on = process.env.MAINTENANCE_MODE === 'true';
  const atPage = req.nextUrl.pathname === '/maintenance';

  if (on && !atPage) {
    return NextResponse.rewrite(new URL('/maintenance', req.url), {
      status: 503,
      headers: { 'Retry-After': '3600' },
    });
  }
  // with the flag off, the page doesn't exist
  if (!on && atPage) return NextResponse.rewrite(new URL('/404', req.url));
  // E19 (SPEC §5.17): link paths are 404 with the flag off, limited per IP, and open without a session (SEC-LINK-04, -05).
  const path = req.nextUrl.pathname;
  const gate = linkGate(path, clientIp(req), process.env.CONFIRM_LINK === 'on', linkLimiter);
  if (gate.kind === 'not_found') {
    return path.startsWith('/api/')
      ? NextResponse.json({ error: 'link_invalid' }, { status: 404 })
      : NextResponse.rewrite(new URL('/404', req.url), { status: 404 });
  }
  if (gate.kind === 'rate_limited') {
    // SEC-LINK-11: logged by route pattern, never the path with its token (SEC-LINK-01)
    authLog('link_rate_limited', { route: linkRoutePattern(path), status: 429 });
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60', ...LINK_HEADERS } });
  }
  if (gate.kind === 'pass') {
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(gate.headers)) res.headers.set(k, v);
    return res;
  }
  // AUTH_REQUIRED=off (the default): no redirect, as before P7 (REQ-AUTH-13)
  if (process.env.AUTH_REQUIRED !== 'on') return NextResponse.next();
  return requireSession(req, ev);
}

export const config = {
  // Node runtime, so AUTH_REQUIRED and the auth secrets are read at run time, not baked into an Edge bundle.
  runtime: 'nodejs',
  // pages only: leave Next internals and static media (the maintenance video) alone
  matcher: ['/((?!_next/|media/|favicon\\.ico|.*\\.[a-z0-9]+$).*)'],
};
