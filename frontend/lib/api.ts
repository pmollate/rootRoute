/**
 * The dashboard's calls to the API go to the same origin (`/api/...`); the Next.js proxy (app/api/[...path]) adds the
 * signed-in user's token server-side. No key and no API host reach the browser (SPEC-auth §5.1, SEC-AUTH-01).
 */

/** REQ-AUTH-11: the session ended before an action reached the API. Screens keep what was typed and offer sign-in. */
export class SessionExpired extends Error {
  constructor() {
    super(SESSION_ENDED);
    this.name = 'SessionExpired';
  }
}
export const SESSION_ENDED = 'Your session has ended. Sign in again; your changes are kept.';
/** Sign in again, then come back to `next` (a dashboard path; /login keeps only same-origin paths, SEC-AUTH-12). */
export const signInAgain = (next: string) => `/login?expired=1&next=${encodeURIComponent(next)}`;

async function check<T>(res: Response, path: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && data.error === 'session_expired') throw new SessionExpired();
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${path}`);
  return data;
}

export async function getJSON<T>(path: string): Promise<T> {
  return check<T>(await fetch(path), path);
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return check<T>(res, path);
}
