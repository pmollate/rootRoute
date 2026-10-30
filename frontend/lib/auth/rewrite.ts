/**
 * REQ-AUTH-15: the URL a middleware rewrite serves `pathname` from, on the request's own origin. Next proxies a rewrite
 * to another origin as an external fetch and drops its status (a 403 came back 200 behind App Service, where AUTH_URL
 * is https and Next sees http), so the origin is taken from the request Next handed in, never from AUTH_URL.
 */
export function internalUrl(req: { nextUrl: URL }, pathname: string): URL {
  const to = new URL(req.nextUrl.href);
  to.pathname = pathname;
  to.search = '';
  to.hash = '';
  return to;
}
