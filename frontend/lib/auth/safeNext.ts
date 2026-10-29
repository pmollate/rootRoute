const HOME = '/dashboard';

/**
 * SEC-AUTH-12: where to go after sign-in. Only a same-origin relative path is kept; an absolute URL, a
 * protocol-relative `//host`, a backslash trick or a path back to /login sends the user to /dashboard.
 */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || /[\u0000-\u001f]/.test(next)) return HOME;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return HOME;
  }
  if (decoded.startsWith('//') || decoded.includes('\\')) return HOME;
  const base = 'http://latelens.invalid';
  const u = new URL(next, base);
  if (u.origin !== base || u.pathname === '/login') return HOME;
  return u.pathname + u.search + u.hash;
}
