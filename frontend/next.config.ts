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

/**
 * Public env checked HERE, not in a client module.
 *
 * This file runs on the server at dev-start and build time, so an unset variable is caught before
 * anything ships. The tempting alternative — a `lib/env.ts` that throws at import — runs inside
 * the client bundle and would white-screen the app for real users instead of failing the build.
 *
 * The backend refuses to boot on bad config (env.validation.ts); this is the frontend's
 * equivalent. The split below is deliberate rather than uniform:
 *
 *   THROW for NEXT_PUBLIC_SOCKET_URL — its absence fails silently and severely. The app builds,
 *   renders, and the "Live" pill sits on "Connecting…" forever while the browser dials localhost.
 *   Nothing in the UI or the logs says why. It is also the one backend URL baked into the client
 *   bundle, since the socket connects directly rather than through the /api rewrite.
 *
 *   WARN for NEXT_PUBLIC_SITE_URL — its absence only makes the Open Graph image resolve against
 *   localhost, so shared links lose their preview. Cosmetic, visible when you look for it, and not
 *   worth blocking a build over.
 *
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is in neither list on purpose: GoogleButton renders null when it is
 * unset, which is a correct and deliberate degradation.
 */
if (!process.env.BACKEND_ORIGIN) {
  throw new Error(
    "BACKEND_ORIGIN is not set. Copy frontend/.env.example to .env.local. " +
      "Every /api/* request is rewritten to this origin, so without it the app cannot talk " +
      "to the backend at all.",
  );
}

if (!process.env.NEXT_PUBLIC_SOCKET_URL) {
  throw new Error(
    "NEXT_PUBLIC_SOCKET_URL is not set. Copy frontend/.env.example to .env.local. " +
      "NEXT_PUBLIC_* is inlined at build time, so it must be set before `next build`.",
  );
}

if (!process.env.NEXT_PUBLIC_SITE_URL) {
  console.warn(
    "[env] NEXT_PUBLIC_SITE_URL is not set — the Open Graph image will resolve against " +
      "localhost, so shared links will not render a preview.",
  );
}

const nextConfig: NextConfig = {
  // When several `next dev` instances run in the same working directory (the -WebPorts farm),
  // each must build into its own folder — they cannot share one `.next`. dev.ps1 sets
  // NEXT_DIST_DIR per instance (e.g. `.next-3000`); the API/single runs leave it as `.next`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
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
