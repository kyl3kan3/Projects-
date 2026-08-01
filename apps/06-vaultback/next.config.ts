import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js opens raw sockets and must not be bundled by Turbopack/webpack.
  // bullmq and ioredis stay listed because package.json still declares them for
  // the queued shape in ARCHITECTURE.md; nothing imports them today (see
  // DEPLOYING.md for why the queue lives in Postgres instead).
  serverExternalPackages: ["postgres", "bullmq", "ioredis"],
};

export default nextConfig;
