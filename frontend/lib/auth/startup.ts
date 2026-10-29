/**
 * SEC-AUTH-09: with AUTH_REQUIRED=on the web app refuses to start without AUTH_SECRET or with an INTERNAL_AUTH_SECRET
 * shorter than 32 bytes. Run from instrumentation.ts when the server starts. Names the setting, never its value.
 */
export function checkWebAuthEnv(env: Record<string, string | undefined>): void {
  if (env.AUTH_REQUIRED !== 'on') return;
  if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET is missing, and AUTH_REQUIRED=on: refusing to start');
  if (!env.INTERNAL_AUTH_SECRET || new TextEncoder().encode(env.INTERNAL_AUTH_SECRET).length < 32) {
    throw new Error('INTERNAL_AUTH_SECRET is missing or shorter than 32 bytes, and AUTH_REQUIRED=on: refusing to start');
  }
}
