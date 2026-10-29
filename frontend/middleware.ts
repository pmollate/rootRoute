import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { toRoles } from '@/lib/auth/roles';

/** Pages any visitor may open (REQ-AUTH-01). `/api/*` checks the session itself: the proxy answers 401, not a redirect. */
const OPEN = ['/login', '/no-access', '/maintenance'];
const isOpen = (path: string) => OPEN.includes(path) || path.startsWith('/api/');

/** P7 (SPEC-auth §5.1): no session → /login?next=<path>; signed in with no LateLens role → /no-access (REQ-AUTH-03). */
const requireSession = auth((req) => {
  const path = req.nextUrl.pathname;
  if (isOpen(path)) return NextResponse.next();
  if (!req.auth?.user) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', path + req.nextUrl.search);
    return NextResponse.redirect(login);
  }
  if (toRoles(req.auth.user.roles).length === 0) return NextResponse.redirect(new URL('/no-access', req.url));
  return NextResponse.next();
});

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
  // Auth.js types its wrapper for route handlers; as middleware it takes (request, event) like Next's own export.
  return requireSession(req, ev as never);
}

export const config = {
  // Node runtime, so AUTH_REQUIRED and the auth secrets are read at run time, not baked into an Edge bundle.
  runtime: 'nodejs',
  // pages only: leave Next internals and static media (the maintenance video) alone
  matcher: ['/((?!_next/|media/|favicon\\.ico|.*\\.[a-z0-9]+$).*)'],
};
