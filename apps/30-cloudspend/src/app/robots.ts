import type { MetadataRoute } from "next";

const base = process.env.APP_URL ?? "http://localhost:3030";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The product screens and every endpoint are never indexable.
        disallow: [
          "/watch",
          "/anomalies",
          "/deploys",
          "/waste",
          "/budgets",
          "/connect",
          "/settings",
          "/api/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
