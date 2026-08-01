import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js must not be bundled: it does runtime require() of its own
  // internals, which webpack cannot statically resolve.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
