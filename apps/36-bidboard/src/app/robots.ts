import type { MetadataRoute } from "next";

const base = (process.env.APP_URL ?? "http://localhost:3036").replace(/\/+$/, "");

/**
 * The marketing page is public. Everything else is not: `/bid/…` holds subcontractor
 * pricing, and a crawled bid link would be a confidentiality incident, not an SEO
 * problem.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/bid/", "/projects/", "/subs/", "/settings/", "/leveling/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
