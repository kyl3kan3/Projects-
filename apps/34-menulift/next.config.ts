import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq","ioredis","postgres","sharp"],
};

export default nextConfig;
