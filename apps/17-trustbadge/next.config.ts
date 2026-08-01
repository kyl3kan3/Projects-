import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js opens raw sockets; it must stay outside the server bundle.
  serverExternalPackages: ["postgres"],

  async headers() {
    return [
      {
        // The embed script is served to third-party storefronts, so it needs
        // permissive CORS. The filename carries no hash, so the cache window is
        // an hour with stale-while-revalidate rather than a year — a merchant
        // must never be stuck on a broken widget build.
        source: "/widget/:path*",
        headers: [
          { key: "access-control-allow-origin", value: "*" },
          { key: "cache-control", value: "public, max-age=3600, stale-while-revalidate=86400" },
          { key: "x-content-type-options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
