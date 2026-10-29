import { SignJWT } from 'jose';

/** A test secret of 32+ bytes (SEC-AUTH-09); never a real one. */
export const SECRET = 'test-internal-auth-secret-0123456789abcdef';
export const AUTH_ON = { required: true, secret: SECRET };

interface Claims { sub: string; name?: string; roles?: string[] }
interface Options { secret?: string; iss?: string; aud?: string; alg?: string; iat?: number; exp?: number }

/** The internal token the web proxy signs (SPEC-auth §5.2), with knobs for the refusal tests. */
export async function token(c: Claims, o: Options = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const iat = o.iat ?? now;
  return new SignJWT({ name: c.name ?? c.sub, roles: c.roles ?? [] })
    .setProtectedHeader({ alg: o.alg ?? 'HS256' })
    .setSubject(c.sub).setIssuer(o.iss ?? 'latelens-web').setAudience(o.aud ?? 'latelens-api')
    .setIssuedAt(iat).setExpirationTime(o.exp ?? iat + 60)
    .sign(new TextEncoder().encode(o.secret ?? SECRET));
}

/** An unsigned `alg: none` token with otherwise valid claims. */
export function noneToken(sub: string, roles: string[]): string {
  const now = Math.floor(Date.now() / 1000);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub, name: sub, roles, iss: 'latelens-web', aud: 'latelens-api',
    iat: now, exp: now + 60 })}.`;
}

export const bearer = async (c: Claims, o?: Options) => ({ authorization: `Bearer ${await token(c, o)}` });

/** Collects the API's JSON log lines, to check the auth_* events (SEC-AUTH-06, REQ-AUTH-13). */
export function logSink() {
  const lines: Record<string, unknown>[] = [];
  return { lines, stream: { write: (s: string) => { lines.push(JSON.parse(s) as Record<string, unknown>); } } };
}
