import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The worker imports ffmpeg/fs — keep these server-only and unbundled.
  serverExternalPackages: ["fluent-ffmpeg", "bullmq", "ioredis", "postgres"],
  // Lint is run explicitly via `npm run lint`; keep `next build` deterministic.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
