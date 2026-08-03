import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Prerendered, so it returns real values. The product surfaces and — importantly —
 * the accountant share links are excluded: a share token in a search index is a
 * financial record on the open web.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/inbox", "/review", "/capture", "/close", "/settings", "/share", "/api"],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
