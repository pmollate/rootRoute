import nextEnv from '@next/env';
import { fileURLToPath } from 'node:url';

/** One .env at the repo root serves the API, the pipeline and this app (API_URL, AUTH_*, INTERNAL_AUTH_SECRET). */
// forceReload: Next has already loaded (and cached) frontend/'s env, which would skip the root .env
nextEnv.loadEnvConfig(fileURLToPath(new URL('..', import.meta.url)), process.env.NODE_ENV !== 'production', console, true);

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
  async headers() {
    return [
      { source: '/media/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
      { source: '/brand/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
    ];
  },
};

export default nextConfig;
