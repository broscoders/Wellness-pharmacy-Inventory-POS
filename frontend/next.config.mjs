/** @type {import('next').NextConfig} */

// The browser only ever talks to /api on the SAME origin as the website.
// Next.js forwards /api/* to the backend. This keeps the refresh-token cookie first-party
// (no CORS / third-party cookie problems) on Vercel and locally.
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
