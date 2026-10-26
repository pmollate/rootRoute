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
  async headers() {
    return [
      { source: '/media/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
      { source: '/brand/:path*', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
    ];
  },
};

export default nextConfig;
