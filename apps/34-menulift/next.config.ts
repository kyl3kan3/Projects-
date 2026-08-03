import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `postgres` and `sharp` must not be bundled; sharp in particular is a native
  // module and Next cannot trace it into the client or edge graph.
  serverExternalPackages: ["postgres", "sharp"],

  experimental: {
    /*
     * Server actions carry two uploads in this app: a dish photo and a POS CSV.
     * The default limit is 1MB, which every phone photo exceeds — and the
     * rejection surfaces as an unhandled 413 error page, not a message. The
     * browser downscales photos before posting (src/app/(app)/photos/PhotoUi.tsx),
     * so this is a backstop rather than the mechanism.
     *
     * Deliberately not larger: Vercel's own request-body ceiling is 4.5MB
     * regardless of what Next allows, so a bigger number here would only move the
     * failure somewhere harder to explain.
     */
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
