import { describe, expect, it } from 'vitest';
import { REFUSALS } from '@/e2e/refusals';
import { PAGE_ROLES, ROLES, canOpen } from '@/lib/auth/roles';
import { PERMISSIONS, rolesFor } from '../../../backend/api/src/core/permissions';

/** "GET /api/carriers" → "/api/carriers", the url rolesFor takes. */
const urlOf = (route: string) => route.split(' ')[1];
const byRole = REFUSALS.map((r) => [r.role, r] as const);

/**
 * AC-NFR-AUTH-04: the e2e refusal table (frontend/e2e/refusals.ts) names, for each of the six roles, a page and an API
 * call the matrix really denies it: the page from PAGE_ROLES (SPEC-auth §4.4), the call from the API's own
 * permissions.ts (§4.2, §4.4). Checked here so the Playwright test cannot drift into asserting a refusal the app never makes.
 */
describe('e2e refusal table (AC-NFR-AUTH-04)', () => {
  it('has exactly one entry per role', () => {
    expect(REFUSALS.map((r) => r.role).sort()).toEqual([...ROLES].sort());
  });

  it.each(byRole)('%s: the page is one the matrix denies it', (role, r) => {
    if (r.page === null) {
      // Only a role allowed every screen may skip the page check; it is refused an API action instead.
      expect(Object.keys(PAGE_ROLES).every((p) => canOpen([role], p))).toBe(true);
    } else {
      expect(Object.keys(PAGE_ROLES)).toContain(r.page);
      expect(canOpen([role], r.page)).toBe(false);
    }
  });

  it.each(byRole)('%s: the API call is a listed route that permissions.ts denies it', (role, r) => {
    // Listed, so a refusal comes from the matrix, not from a mistyped route nobody registered.
    expect(Object.keys(PERMISSIONS)).toContain(r.api.route);
    expect(r.api.route.startsWith(`${r.api.method} `)).toBe(true);
    const allowed = rolesFor(r.api.method, urlOf(r.api.route), r.api.body);
    expect(allowed).not.toBe('public');
    expect(allowed === null || !allowed.includes(role)).toBe(true);
    // The path called matches the route checked: each `:param` stands for one segment.
    expect(r.api.path).toMatch(new RegExp(`^${urlOf(r.api.route).replace(/:[^/]+/g, '[^/]+')}$`));
  });

  it('is read-only: a POST is used only where every role is refused (default deny), so it can never write', () => {
    for (const r of REFUSALS.filter((x) => x.api.method !== 'GET')) {
      expect(rolesFor(r.api.method, urlOf(r.api.route), r.api.body), r.role).toBeNull();
    }
  });
});
