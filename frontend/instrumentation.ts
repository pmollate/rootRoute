import { checkWebAuthEnv } from '@/lib/auth/startup';

/**
 * Runs once when the Next.js server starts: fail closed on missing auth settings (SEC-AUTH-09). Next would otherwise
 * keep running and answer 500 to everything; exiting makes App Service show the app as down, naming the setting.
 */
export function register() {
  try {
    checkWebAuthEnv(process.env);
  } catch (e) {
    console.error((e as Error).message);
    if (process.env.NEXT_RUNTIME === 'nodejs') process.exit(1);
    throw e;
  }
}
