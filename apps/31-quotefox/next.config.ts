import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js opens raw sockets, so it must stay out of the bundler.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
