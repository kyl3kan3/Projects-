import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js opens raw sockets; it must not be bundled for the server runtime.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
