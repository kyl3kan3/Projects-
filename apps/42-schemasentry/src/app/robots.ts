import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Metadata routes are prerendered, so this returns real values rather than
 * reaching for anything that needs a database or a secret.
 *
 * The dashboard and the `/v1` surface are disallowed; public changelog pages are
 * the entire point of being indexed (the distribution loop in README's GTM).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/c/"],
        disallow: ["/apis", "/settings", "/api/", "/login", "/signup"],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
