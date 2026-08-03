import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
};

/**
 * Serwist builds the service worker from src/sw.ts and injects the precache
 * manifest. Disabled in `next dev` on purpose: a worker that caches a dev bundle
 * serves yesterday's JavaScript. Offline behaviour is verified against
 * `next build && next start`, which is what production is.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
});

export default withSerwist(nextConfig);
