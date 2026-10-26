import { NextResponse, type NextRequest } from 'next/server';

/** MAINTENANCE_MODE=true in .env serves the maintenance page (503) on every route. */
export function middleware(req: NextRequest) {
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
  return NextResponse.next();
}

export const config = {
  // pages only: leave Next internals and static media (the maintenance video) alone
  matcher: ['/((?!_next/|media/|favicon\\.ico|.*\\.[a-z0-9]+$).*)'],
};
