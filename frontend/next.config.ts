import type { NextConfig } from "next";

/**
 * The browser talks only to the Next.js origin; requests to `/api/*` are proxied to the NestJS
 * backend by the dev/prod server via this rewrite.
 *
 * Why proxy instead of calling the backend directly: it keeps every request same-origin, so no
 * CORS configuration is needed on the backend — which honours Phase 2's rule of not touching the
 * backend architecture. (Phase 3's WebSocket connection will be direct and will introduce CORS
 * there, because sockets don't travel through HTTP rewrites.)
 *
 * BACKEND_ORIGIN is a server-only env var (no NEXT_PUBLIC_ prefix): the rewrite runs on the
 * Next server, and the backend URL should never be baked into client bundles.
 */
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
