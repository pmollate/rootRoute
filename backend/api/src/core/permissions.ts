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

// Reads (SPEC-auth §4.4, REQ-AUTH-16): each GET is open to the roles of the pages that call it, mirroring PAGE_ROLES in
// frontend/lib/auth/roles.ts. A role reads only what its own screens show.
const ALL = ROLES; // Overview and Order journey: every role
const INTAKE_READ: readonly Role[] = ['order_desk', 'warehouse_supervisor', 'admin']; // Order emails (+ Journey picker)
const COMPLAINTS_READ: readonly Role[] = ['customer_support', 'admin']; // Complaints
const WAREHOUSE_READ: readonly Role[] = ['warehouse_supervisor', 'leadership', 'admin']; // Warehouses
const CARRIER_READ: readonly Role[] = ['carrier_manager', 'leadership', 'admin']; // Carriers
const ACCOUNTS_READ: readonly Role[] = ['warehouse_supervisor', 'carrier_manager', 'leadership', 'admin']; // Warehouses, Replay

const ORDER_DESK: readonly Role[] = ['order_desk', 'admin'];
// Q-AUTH-03 is open: the §4.2 default until A and B decide. One entry, so the answer changes one line.
const WMS_ENTRY: readonly Role[] = ['warehouse_supervisor', 'admin'];
const CARRIERS: readonly Role[] = ['carrier_manager', 'admin'];
const SUPPORT: readonly Role[] = ['customer_support', 'admin'];
const ADMIN: readonly Role[] = ['admin']; // App settings (design 2026-10-30-order-journey-auto-advance §4, SEC-SET-01)

export const PERMISSIONS: Record<string, Permission> = {
  'GET /api/health': 'public',
  'POST /api/mcp': 'public', // its own Bearer MCP_TOKEN (REQ-MCP-02)
  'GET /api/mcp': 'public', // 405: MCP clients probe it before connecting
  'DELETE /api/mcp': 'public', // 405, as GET
  'POST /api/mcp/:token': 'public', // MCP_TOKEN in the path, for claude.ai connectors (REQ-MCP-02)
  'GET /api/mcp/:token': 'public', // 405, as GET /api/mcp
  'DELETE /api/mcp/:token': 'public', // 405, as GET
  'GET /.well-known/*': 'public', // 404: MCP clients' OAuth discovery
  'POST /api/orders/:ref/events': 'public', // its own Bearer WMS_EVENTS_TOKEN (order journey simulator, design §6)
  'GET /api/confirm/:token': 'public', // token-gated: a valid one-time token in the path, no session, no key (SEC-LINK-05)
  'POST /api/confirm/:token': 'public', // token-gated: a valid one-time token in the path, no session, no key (SEC-LINK-05)
  'POST /api/confirm/:token/lookup': 'public', // token-gated as above; reads a pin for the page (REQ-LINK-16)
  'POST /api/confirm/:token/code': 'public', // token-gated as above; emails the verification code (REQ-LINK-18)
  'POST /api/confirm/:token/verify': 'public', // token-gated as above; the code for a verification token (REQ-LINK-19)

  // Reads, by the pages that use them
  'GET /api/overview': { roles: ALL },
  'GET /api/causes': { roles: ALL },
  'GET /api/replay': { roles: ALL },
  'GET /api/compare': { roles: ACCOUNTS_READ }, // D11: Replay only
  'GET /api/attribution': { roles: ALL },
  'GET /api/cause-kpis': { roles: ALL },
  'GET /api/journey/:ref': { roles: ALL },
  'GET /api/accounts': { roles: ACCOUNTS_READ },
  'GET /api/warehouses': { roles: WAREHOUSE_READ },
  'GET /api/penalties/unpaid': { roles: WAREHOUSE_READ },
  'GET /api/placement': { roles: WAREHOUSE_READ },
  'GET /api/intake': { roles: INTAKE_READ },
  'GET /api/intake/:id': { roles: INTAKE_READ },
  'GET /api/intake/review': { roles: INTAKE_READ },
  'GET /api/complaints': { roles: COMPLAINTS_READ },
  'GET /api/carriers': { roles: CARRIER_READ },
  'GET /api/carriers/backtest': { roles: CARRIER_READ },
  'GET /api/tracking': { roles: CARRIER_READ },
  'GET /api/settings': { roles: ALL }, // the Settings page shows every role the switch's state

  // Agent gates
  'POST /api/intake/email': { roles: ORDER_DESK, legacyKey: true },
  'POST /api/intake/fetch': { roles: ORDER_DESK, legacyKey: true },
  'POST /api/intake/:id/action': { legacyKey: true, byAction: {
    approve: ORDER_DESK, reject: ORDER_DESK, send_reply: ORDER_DESK, send_to_wms: WMS_ENTRY } },
  'POST /api/orders': { roles: ORDER_DESK }, // not built yet (SPEC §7, E11)
  'POST /api/orders/edi': { roles: ORDER_DESK }, // not built yet (SPEC §7, E11)
  'POST /api/recommend': { roles: CARRIERS, legacyKey: true },
  'POST /api/overrides': { roles: CARRIERS, legacyKey: true },
  'POST /api/complaints/:id/triage': { roles: SUPPORT, legacyKey: true },
  'POST /api/alerts/run': { roles: SUPPORT, legacyKey: true },
  'POST /api/settings/auto-advance': { roles: ADMIN, legacyKey: true },
  // D10 (SEC-ASK-05): every role; the shared key while AUTH_REQUIRED=off, as for every model route (NS-02). Never public.
  'POST /api/assistant': { roles: ALL, legacyKey: true },
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
