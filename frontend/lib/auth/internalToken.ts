import { SignJWT } from 'jose';
import type { SessionUser } from './roles';

/** SPEC-auth §5.2: signed per request for the server-to-server hop only, never stored, never sent to the browser. */
export async function signInternalToken(user: Pick<SessionUser, 'id' | 'name' | 'roles'>, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ name: user.name, roles: user.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id).setIssuer('latelens-web').setAudience('latelens-api')
    .setIssuedAt(now).setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(secret));
}
