import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["bullmq", "ioredis", "postgres", "stripe", "twilio"],
  devIndicators: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
