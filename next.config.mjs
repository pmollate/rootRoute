/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Frame URLs carry the export id (?v=), so they can be cached hard.
        source: '/frames/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // The manifest names the current export, so it must always be revalidated.
        source: '/frames/:variant/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        // Posters keep fixed names across exports.
        source: '/frames/:variant/posters/:file',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ];
  },
};

export default nextConfig;
