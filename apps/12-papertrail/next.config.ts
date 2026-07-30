import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq","ioredis","postgres","puppeteer"],
};

export default nextConfig;
