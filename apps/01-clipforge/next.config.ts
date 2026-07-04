import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  // The worker imports ffmpeg/fs — keep these server-only and unbundled.
  serverExternalPackages: ["fluent-ffmpeg", "bullmq", "ioredis", "postgres"],
  // Lint is run explicitly via `npm run lint`; keep `next build` deterministic.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
