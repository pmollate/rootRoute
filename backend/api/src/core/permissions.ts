import { ROLES, type Role } from './contracts.js';

export { ROLES };

/**
 * SPEC-auth §4.2: who may call each route, keyed "METHOD /api/path" as Fastify registers it. Default deny: a route not
 * in this table is refused for every role (REQ-AUTH-06), and test/routes/permissions.test.ts fails until it is added.
 * `legacyKey`: the route needed the shared x-api-key before P7, which AUTH_REQUIRED=off keeps (REQ-AUTH-13).
 */
type Rule = { roles: readonly Role[]; legacyKey?: boolean };
type ByAction = { byAction: Record<string, readonly Role[]>; legacyKey?: boolean };
export type Permission = 'public' | Rule | ByAction;

const READ = ROLES;
const ORDER_DESK: readonly Role[] = ['order_desk', 'admin'];
// Q-AUTH-03 is open: the §4.2 default until A and B decide. One entry, so the answer changes one line.
const WMS_ENTRY: readonly Role[] = ['warehouse_supervisor', 'admin'];
const CARRIERS: readonly Role[] = ['carrier_manager', 'admin'];
const SUPPORT: readonly Role[] = ['customer_support', 'admin'];

export const PERMISSIONS: Record<string, Permission> = {
  'GET /api/health': 'public',
  'POST /api/mcp': 'public', // its own Bearer MCP_TOKEN (REQ-MCP-02)

  // Open any page; read any data
  'GET /api/overview': { roles: READ },
  'GET /api/causes': { roles: READ },
  'GET /api/replay': { roles: READ },
  'GET /api/accounts': { roles: READ },
  'GET /api/attribution': { roles: READ },
  'GET /api/cause-kpis': { roles: READ },
  'GET /api/warehouses': { roles: READ },
  'GET /api/penalties/unpaid': { roles: READ },
  'GET /api/placement': { roles: READ },
  'GET /api/intake': { roles: READ },
  'GET /api/intake/:id': { roles: READ },
  'GET /api/intake/review': { roles: READ },
  'GET /api/complaints': { roles: READ },
  'GET /api/carriers': { roles: READ },
  'GET /api/carriers/backtest': { roles: READ },
  'GET /api/tracking': { roles: READ },
  'GET /api/journey/:ref': { roles: READ },

  // Agent gates
  'POST /api/intake/email': { roles: ORDER_DESK, legacyKey: true },
  'POST /api/intake/fetch': { roles: ORDER_DESK, legacyKey: true },
  'POST /api/intake/:id/action': { legacyKey: true, byAction: {
    approve: ORDER_DESK, reject: ORDER_DESK, send_reply: ORDER_DESK, send_to_wms: WMS_ENTRY } },
  'POST /api/orders': { roles: ORDER_DESK }, // not built yet (SPEC §7, E11)
  'POST /api/orders/edi': { roles: ORDER_DESK }, // not built yet (SPEC §7, E11)
  'POST /api/recommend': { roles: CARRIERS },
  'POST /api/overrides': { roles: CARRIERS, legacyKey: true },
  'POST /api/complaints/:id/triage': { roles: SUPPORT },
  'POST /api/alerts/run': { roles: SUPPORT, legacyKey: true },
};

export function permissionFor(method: string, url: string | undefined): Permission | null {
  if (!url) return null;
  return PERMISSIONS[`${method === 'HEAD' ? 'GET' : method} ${url}`] ?? null;
}

/** The roles allowed for this call, 'public', or null (refused for everyone). The action, not only the route, decides. */
export function rolesFor(method: string, url: string | undefined, body?: unknown): readonly Role[] | 'public' | null {
  const p = permissionFor(method, url);
  if (p === null || p === 'public') return p;
  if ('roles' in p) return p.roles;
  const action = (body as { action?: unknown } | null | undefined)?.action;
  return typeof action === 'string' && Object.hasOwn(p.byAction, action) ? p.byAction[action] : null;
}
