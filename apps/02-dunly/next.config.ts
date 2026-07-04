import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The worker imports server-only libs; keep them out of the client graph.
  serverExternalPackages: ["bullmq", "ioredis", "postgres"],
};

export default nextConfig;
