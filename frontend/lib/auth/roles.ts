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
};
export type UiAction = 'paste' | 'fetch' | 'approve' | 'reject' | 'send_reply' | 'send_to_wms' | 'override' | 'triage';

/** With no session (AUTH_REQUIRED=off, nobody signed in) nothing is hidden, as before P7 (REQ-AUTH-13). */
export function can(roles: readonly Role[] | null | undefined, action: UiAction): boolean {
  if (!roles) return true;
  return roles.some((r) => UI[action].includes(r));
}
