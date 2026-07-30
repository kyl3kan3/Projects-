import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq","ioredis","postgres","playwright"],
};

export default nextConfig;
