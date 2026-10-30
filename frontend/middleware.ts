import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { authLog } from '@/lib/auth/log';
import { internalUrl } from '@/lib/auth/rewrite';
import { canOpen, toRoles } from '@/lib/auth/roles';

/**
 * Pages any visitor may open (REQ-AUTH-01): the landing page `/` and the sign-in pages. `/api/*` checks the session
 * itself: the proxy answers 401, not a redirect.
 */
const OPEN = ['/', '/login', '/no-access', '/maintenance'];
const isOpen = (path: string) => OPEN.includes(path) || path.startsWith('/api/');

/**
 * P7 (SPEC-auth §5.1): no session → /login?next=<path>; signed in with no LateLens role → /no-access (REQ-AUTH-03).
 * Auth.js hands the callback a request rebuilt on AUTH_URL's origin (https behind App Service, while Next sees http),
 * so the 403 rewrite is built from the original request: same origin, served internally, status kept.
 */
const requireSession = (orig: NextRequest, ev: NextFetchEvent) => auth((req) => {
  const path = req.nextUrl.pathname;
  if (isOpen(path)) return NextResponse.next();
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
