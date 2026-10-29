import { checkWebAuthEnv } from '@/lib/auth/startup';

/** Runs once when the Next.js server starts: fail closed on missing auth settings (SEC-AUTH-09). */
export function register() {
  checkWebAuthEnv(process.env);
}
