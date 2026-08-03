import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `postgres` must not be bundled: postgres.js resolves its own protocol
   * modules at runtime and webpack's static analysis mangles them.
   *
   * `bullmq` and `ioredis` used to be listed here. They are gone because the
   * queue is gone — Vercel has no always-on process to drain one, so retryable
   * fan-out lives in `notification_deliveries` instead (see README's
   * implementation notes).
   */
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
