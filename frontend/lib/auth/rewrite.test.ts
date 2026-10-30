import { describe, expect, it } from 'vitest';
import { internalUrl } from '@/lib/auth/rewrite';

const req = (href: string) => ({ nextUrl: new URL(href) });

/**
 * AC-AUTH-15, AC-NFR-AUTH-04: the forbidden page is rewritten on the request's own origin, so Next serves it internally
 * with the 403 rather than proxying the public host (which answered 200).
 */
describe('internalUrl (REQ-AUTH-15)', () => {
  it('keeps the origin Next sees, even when the public URL is https', () => {
    const to = internalUrl(req('http://localhost:8080/dashboard/carriers'), '/dashboard/forbidden');
    expect(to.origin).toBe('http://localhost:8080');
    expect(to.pathname).toBe('/dashboard/forbidden');
  });

  it('drops the query and hash of the refused page', () => {
    const to = internalUrl(req('http://localhost:8080/dashboard/carriers?lane=D-MW#top'), '/dashboard/forbidden');
    expect(to.href).toBe('http://localhost:8080/dashboard/forbidden');
  });

  it('does not change the request it was given', () => {
    const r = req('http://localhost:8080/dashboard/carriers?lane=D-MW');
    internalUrl(r, '/dashboard/forbidden');
    expect(r.nextUrl.href).toBe('http://localhost:8080/dashboard/carriers?lane=D-MW');
  });
});
