import type { MetadataRoute } from "next";

/**
 * The patient packet, the dashboard and the API are all disallowed. A tokenized
 * link is not a secret a crawler should ever hold, and an indexed intake URL is
 * a disclosure waiting to happen.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3048";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/intake/", "/intakes", "/forms", "/patients", "/audit", "/settings", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
