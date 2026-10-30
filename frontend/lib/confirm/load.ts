import type { LinkView } from '@/components/confirm/ConfirmScreen';
import type { VerifyView } from '@/components/confirm/VerifyStep';

// Server code only: reads API_URL from the environment. Never import from a client component.

/**
 * E19 (SPEC §5.17): the page's data straight from the API (`API_URL`, as the /api proxy uses). The route is public and
 * token-gated, so no key, internal token or cookie is added (SEC-LINK-05). 200 → the view; 404 → null, which the page
 * turns into the one invalid-link 404 (REQ-LINK-07). Any other answer is an error, not "no longer valid". Never cached:
 * the map credential is issued per request (SEC-LINK-08). With CONFIRM_LINK_CODE on the server never has the
 * verification token, so the answer is the VerifyView (masked sender only, REQ-LINK-17); the browser fetches the address.
 */
export async function loadLink(token: string, fetcher: typeof fetch = fetch): Promise<LinkView | VerifyView | null> {
  const api = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const r = await fetcher(`${api}/api/confirm/${encodeURIComponent(token)}`, { cache: 'no-store', headers: { accept: 'application/json' } });
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`confirm link API answered ${r.status}`); // the status only: never the token (SEC-LINK-01)
  return (await r.json()) as LinkView | VerifyView;
}
