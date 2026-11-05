/**
 * Pages any visitor may open (REQ-AUTH-01): the landing page `/`, the pitch deck `/present` and the sign-in pages.
 * `/api/*` checks the session itself: the proxy answers 401, not a redirect.
 */
const OPEN = ['/', '/present', '/login', '/no-access', '/maintenance'];

/** E19: exactly `/confirm/<token>`; not `/confirm`, `/confirmx` or deeper paths (SEC-LINK-05, AC-SEC-LINK-05). */
export const isLinkPage = (path: string) => /^\/confirm\/[^/]+$/.test(path);

export const isOpen = (path: string, confirmLink: boolean) =>
  OPEN.includes(path) || path.startsWith('/api/') || (confirmLink && isLinkPage(path));
