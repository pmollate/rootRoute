import { SCREENS } from '@/config/dashboard';

/** P7 roles (SPEC-auth §4.1). Same ids as backend/api/src/core/contracts.ts. */
export const ROLES = ['order_desk', 'warehouse_supervisor', 'carrier_manager', 'customer_support', 'leadership', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  order_desk: 'Order desk', warehouse_supervisor: 'Warehouse supervisor', carrier_manager: 'Carrier manager',
  customer_support: 'Customer support', leadership: 'Leadership', admin: 'Admin',
};

/** The signed-in person as the web app knows them: Entra `oid` or `demo:<email>`, display name, LateLens roles. */
export interface SessionUser { id: string; name: string; roles: Role[]; demo: boolean }

/** Only the six ids count (REQ-AUTH-03); anything else in a token or account entry is ignored. */
export function toRoles(v: unknown): Role[] {
  if (!Array.isArray(v)) return [];
  return ROLES.filter((r) => v.includes(r));
}

/**
 * Which buttons a role sees (SPEC-auth §4.3), mirroring backend/api/src/core/permissions.ts. Hiding is a convenience:
 * the API refuses anyway (REQ-AUTH-05). `send_to_wms` follows the §4.2 default while Q-AUTH-03 is open.
 */
const UI: Record<string, readonly Role[]> = {
  paste: ['order_desk', 'admin'], fetch: ['order_desk', 'admin'], approve: ['order_desk', 'admin'],
  reject: ['order_desk', 'admin'], send_reply: ['order_desk', 'admin'], send_to_wms: ['warehouse_supervisor', 'admin'],
  override: ['carrier_manager', 'admin'], triage: ['customer_support', 'admin'],
  settings: ['admin'],
};
export type UiAction = 'paste' | 'fetch' | 'approve' | 'reject' | 'send_reply' | 'send_to_wms' | 'override' | 'triage' | 'settings';

/** With no session (AUTH_REQUIRED=off, nobody signed in) nothing is hidden, as before P7 (REQ-AUTH-13). */
export function can(roles: readonly Role[] | null | undefined, action: UiAction): boolean {
  if (!roles) return true;
  return roles.some((r) => UI[action].includes(r));
}

/**
 * Which dashboard screens each role may open (SPEC-auth §4.4, REQ-AUTH-15): least privilege, each role its own workspace
 * plus Overview and Order journey. The API limits each GET to the same roles (backend/api/src/core/permissions.ts).
 */
export const PAGE_ROLES: Record<string, readonly Role[]> = {
  '/dashboard/overview': ROLES,
  '/dashboard/intake': ['order_desk', 'warehouse_supervisor', 'admin'],
  '/dashboard/complaints': ['customer_support', 'admin'],
  '/dashboard/warehouses': ['warehouse_supervisor', 'leadership', 'admin'],
  '/dashboard/carriers': ['carrier_manager', 'leadership', 'admin'],
  '/dashboard/journey': ROLES,
  '/dashboard/labs': ['warehouse_supervisor', 'carrier_manager', 'leadership', 'admin'],
};

/** Each role's start page after sign-in: its own workspace; leadership and admin start on Overview. */
export const HOME: Record<Role, string> = {
  order_desk: '/dashboard/intake', warehouse_supervisor: '/dashboard/warehouses', carrier_manager: '/dashboard/carriers',
  customer_support: '/dashboard/complaints', leadership: '/dashboard/overview', admin: '/dashboard/overview',
};

/**
 * Where a signed-in user starts: the start page of their first role in ROLES order. With no roles (nobody signed in,
 * AUTH_REQUIRED=off), the first screen in nav order.
 */
export function homeFor(roles: readonly Role[] | null | undefined): string {
  const role = ROLES.find((r) => roles?.includes(r));
  return role ? HOME[role] : SCREENS[0].href;
}

/** Whether a role may open `path`. Paths that are not a screen (`/`, `/dashboard`, the forbidden page) are open. */
export function canOpen(roles: readonly Role[] | null | undefined, path: string): boolean {
  if (!roles) return true;
  const page = path.split(/[?#]/)[0]; // a section link (#routes) or a query belongs to its screen
  const screen = Object.keys(PAGE_ROLES).find((href) => page === href || page.startsWith(`${href}/`));
  return !screen || roles.some((r) => PAGE_ROLES[screen].includes(r));
}
