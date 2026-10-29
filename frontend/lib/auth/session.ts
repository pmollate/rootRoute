import { auth } from '@/auth';
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
