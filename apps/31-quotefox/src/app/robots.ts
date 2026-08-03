import type { MetadataRoute } from "next";

const base = process.env.APP_URL ?? "http://localhost:3031";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Signed homeowner links and the contractor's own screens never get indexed.
        disallow: ["/p/", "/jobs", "/estimates", "/price-book", "/proposals", "/settings", "/onboarding", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
