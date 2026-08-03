import type { MetadataRoute } from "next";

const base = process.env.APP_URL ?? "http://localhost:3062";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Vendor upload links are bearer credentials and the console is private.
        disallow: ["/v/", "/dashboard", "/vendors", "/properties", "/requirements", "/review", "/settings", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
