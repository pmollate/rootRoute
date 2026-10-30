import nextEnv from '@next/env';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** One .env at the repo root serves the API, the pipeline and this app (API_URL, AUTH_*, INTERNAL_AUTH_SECRET). */
// forceReload: Next has already loaded (and cached) frontend/'s env, which would skip the root .env.
// Once per process tree: `next dev` loads this file again in a worker that inherits the env, and a second load
// re-expands the already-unescaped values (the `$` in AUTH_DEMO_USERS's bcrypt hashes), blanking them.
if (!process.env.ROOT_ENV_LOADED) {
  nextEnv.loadEnvConfig(fileURLToPath(new URL('..', import.meta.url)), process.env.NODE_ENV !== 'production', console, true);
  // Then this environment's non-secret defaults (config/environments/<APP_ENV>.env); never overwrites a set variable.
  const appEnv = process.env.APP_ENV || (['production', 'test'].includes(process.env.NODE_ENV) ? process.env.NODE_ENV : 'development');
  for (const dir of ['../config/environments/', './config/environments/']) {
    const file = fileURLToPath(new URL(`${dir}${appEnv}.env`, import.meta.url));
    if (existsSync(file)) { process.loadEnvFile(file); break; }
  }
  process.env.ROOT_ENV_LOADED = '1';
}

/**
 * Media and brand files keep fixed names across re-cuts (scripts/process-media.sh), so they are not
 * cached as immutable: browsers reuse them for a day, then serve the cached copy while revalidating
 * in the background for up to 30 days. Repeat visits skip ~50 MB of video and frames.
 */
const ASSET_CACHE = 'public, max-age=86400, stale-while-revalidate=2592000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // middleware only sees env passed through here, not the root .env loaded above
  env: { MAINTENANCE_MODE: process.env.MAINTENANCE_MODE ?? 'false' },
  // Replay moved to Labs; old links and bookmarks still land on it.
  async redirects() {
    return [{ source: '/dashboard/replay', destination: '/dashboard/labs', permanent: false }];
  },
  async headers() {
    return [
      { source: '/media/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
      { source: '/brand/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
    ];
  },
};

export default nextConfig;
