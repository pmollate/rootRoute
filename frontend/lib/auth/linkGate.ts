import type { RateLimiter } from './demo';
import { isLinkPage } from './open';
import { isLinkRoute } from './proxy';

/** SEC-LINK-07: on every /confirm/* response. */
export const LINK_HEADERS = { 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' } as const;

export type LinkGate = { kind: 'not_link' } | { kind: 'not_found' } | { kind: 'rate_limited' } | { kind: 'pass'; headers: typeof LINK_HEADERS };

/** SEC-LINK-01: a path as web log lines may show it; any `/confirm/…` or `/api/confirm/…` loses its token. */
export function linkRoutePattern(path: string): string {
  return path.replace(/^(\/api)?\/confirm\/.*$/, (_m, api: string | undefined) => `${api ?? ''}/confirm/[token]`);
}

/**
 * E19 in the middleware: with CONFIRM_LINK off both link paths are 404 (REQ-LINK-09); with it on, at most `limiter`'s
 * requests per minute per client IP (SEC-LINK-04), then the page goes on without a session (SEC-LINK-05).
 */
export function linkGate(path: string, ip: string, enabled: boolean, limiter: RateLimiter): LinkGate {
  if (!isLinkPage(path) && !isLinkRoute(path)) return { kind: 'not_link' };
  if (!enabled) return { kind: 'not_found' };
  if (!limiter.take(ip)) return { kind: 'rate_limited' };
  return { kind: 'pass', headers: LINK_HEADERS };
}
