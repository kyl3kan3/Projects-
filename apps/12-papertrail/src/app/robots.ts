import type { MetadataRoute } from "next";

/**
 * Client document links are capability URLs. They must never be crawled — an
 * indexed contract is a leaked contract — so /d/ is disallowed outright, as are
 * the signed-in screens.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/d/", "/chain", "/documents", "/income", "/settings", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
