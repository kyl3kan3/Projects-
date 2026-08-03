import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js must stay a real Node module rather than being bundled: it uses
  // node:net and node:tls directly.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
