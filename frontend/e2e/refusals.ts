import type { Role } from '@/lib/auth/roles';

/**
 * AC-NFR-AUTH-04: one refusal per role for the e2e suite (roles.spec.ts). Each page comes from the page matrix
 * (SPEC-auth §4.4, PAGE_ROLES) and each call from the API's permissions.ts (§4.2, §4.4); lib/auth/refusals.test.ts
 * checks both, so an entry the app would allow fails the unit tests before it reaches Playwright.
 * Read-only: every call is a GET, except admin's, a POST the API refuses for every role before any handler runs.
 */
export interface Refusal {
  role: Role;
  /** A dashboard screen the role may not open; null only for a role allowed every screen (admin). */
  page: string | null;
  api: {
    method: 'GET' | 'POST';
    /** The path called through the web app's /api proxy. */
    path: string;
    /** The route as permissions.ts keys it ("METHOD /api/pattern"). */
    route: string;
    body?: Record<string, unknown>;
  };
}

export const REFUSALS: readonly Refusal[] = [
  // AC-AUTH-15 and AC-AUTH-16: order desk sees no carrier screen or data.
  { role: 'order_desk', page: '/dashboard/carriers',
    api: { method: 'GET', path: '/api/carriers', route: 'GET /api/carriers' } },
  // AC-AUTH-16: complaints hold client contact details; only customer support and admin read them.
  { role: 'warehouse_supervisor', page: '/dashboard/complaints',
    api: { method: 'GET', path: '/api/complaints', route: 'GET /api/complaints' } },
  { role: 'carrier_manager', page: '/dashboard/intake',
    api: { method: 'GET', path: '/api/intake', route: 'GET /api/intake' } },
  { role: 'customer_support', page: '/dashboard/warehouses',
    api: { method: 'GET', path: '/api/warehouses', route: 'GET /api/warehouses' } },
  // §4.4: leadership does not see the order-email or complaint queues.
  { role: 'leadership', page: '/dashboard/intake',
    api: { method: 'GET', path: '/api/complaints', route: 'GET /api/complaints' } },
  // Admin may open every screen and make every listed call, so its refusal is default deny (REQ-AUTH-06): an intake
  // action permissions.ts does not list. The route has no body schema, so the preHandler answers 403 before validation,
  // and no intake 0 exists either way.
  { role: 'admin', page: null,
    api: { method: 'POST', path: '/api/intake/0/action', route: 'POST /api/intake/:id/action', body: { action: 'e2e_not_an_action' } } },
];
