/**
 * SEC-AUTH-06: one JSON line per sign-in event, read by App Insights (AppServiceConsoleLogs). Never a password, token
 * or cookie: callers pass only the event, the user id (or attempted email) and the route.
 */
export function authLog(event: string, fields: { user?: string | null; email?: string; route?: string; status?: number } = {}): void {
  console.log(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}
