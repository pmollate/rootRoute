/** Root Route dashboard (app/dashboard). Screens in nav order; each problem area owns its screens (SPEC §5.7). */
export const SCREENS = [
  { href: '/dashboard/overview', label: 'Overview', owner: 'B' },
  { href: '/dashboard/intake', label: 'Order emails', owner: 'A' },
  { href: '/dashboard/warehouses', label: 'Warehouses', owner: 'B' },
  { href: '/dashboard/carriers', label: 'Carriers', owner: 'C' },
  { href: '/dashboard/replay', label: 'Replay & decision', owner: 'B' },
] as const;

/** Node API (backend/api). Set in the repo-root .env; next.config.mjs loads it. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
/** Shared demo key for write endpoints. Visible in the browser: synthetic data only (CONTRACTS §7). */
export const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? '';
