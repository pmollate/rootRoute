/** Root Route dashboard (app/dashboard). Screens in nav order; each problem area owns its screens (SPEC §5.7). */
export const SCREENS = [
  { href: '/dashboard/overview', label: 'Overview', owner: 'B' },
  { href: '/dashboard/intake', label: 'Order emails', owner: 'A' },
  { href: '/dashboard/warehouses', label: 'Warehouses', owner: 'B' },
  { href: '/dashboard/carriers', label: 'Carriers', owner: 'C' },
  { href: '/dashboard/journey', label: 'Order journey', owner: 'C' },
  { href: '/dashboard/replay', label: 'Replay', owner: 'B' },
] as const;

// The API is reached through the same-origin proxy app/api/[...path] (lib/api.ts); its URL and keys are server-side only.
