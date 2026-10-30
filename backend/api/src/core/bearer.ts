import { timingSafeEqual } from 'node:crypto';

/** `Authorization: Bearer <token>`, compared in constant time. No token configured means the endpoint is off, never open. */
export function bearerAuth(header: string | undefined, token: string | undefined): 200 | 401 | 503 {
  if (!token) return 503;
  const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '');
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want) ? 200 : 401;
}
