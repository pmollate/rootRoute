/** Root Route dashboard (app/dashboard). Screens in nav order; each problem area owns its screens (SPEC §5.7). */
export const SCREENS = [
  { href: '/dashboard/overview', label: 'Overview', owner: 'B' },
  { href: '/dashboard/intake', label: 'Order emails', owner: 'A' },
  { href: '/dashboard/complaints', label: 'Complaints', owner: 'A' },
  { href: '/dashboard/warehouses', label: 'Warehouses', owner: 'B' },
  { href: '/dashboard/carriers', label: 'Carriers', owner: 'C' },
  { href: '/dashboard/journey', label: 'Order journey', owner: 'C' },
  { href: '/dashboard/replay', label: 'Replay', owner: 'B' },
] as const;

/**
 * Master navigation, left to right: Order journey (pinned to the bar), the Dashboard menu (every other screen, a report
 * each, with Orders, the order-email queue, in Order journey's slot), Labs and Settings. Labs and Settings are open to
 * every role.
 */
export const PINNED = '/dashboard/journey';
export const ORDERS = { href: '/dashboard/intake', label: 'Orders' } as const;
export const MORE = [
  { href: '/dashboard/labs', label: 'Labs' },
  { href: '/dashboard/settings', label: 'Settings' },
] as const;

// The API is reached through the same-origin proxy app/api/[...path] (lib/api.ts); its URL and keys are server-side only.
