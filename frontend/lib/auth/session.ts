import { auth } from '@/auth';
import type { ProxySettings } from './proxy';
import type { SessionUser } from './roles';

// Server code only: reads secrets from the environment. Never import from a client component.

/** AUTH_REQUIRED=on (SPEC-auth §9.2). Off is the default and keeps the app as before P7 (REQ-AUTH-13). */
export const authRequired = () => process.env.AUTH_REQUIRED === 'on';

/** The signed-in user, or null. Without AUTH_SECRET (sign-in not set up, AUTH_REQUIRED=off) nobody can be signed in. */
export async function currentUser(): Promise<SessionUser | null> {
  if (!process.env.AUTH_SECRET) return null;
  try {
    return (await auth())?.user ?? null;
  } catch {
    return null;
  }
}

/** Server-only settings for the proxy. API_URL falls back to the old build-time NEXT_PUBLIC_API_URL until step 7. */
export function proxySettings(req: Request): ProxySettings {
  const fallbackOrigin = new URL(req.url).origin;
  return {
    required: authRequired(),
    apiUrl: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    appOrigin: process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : fallbackOrigin,
    internalSecret: process.env.INTERNAL_AUTH_SECRET || undefined,
    apiKey: process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || undefined,
  };
}
