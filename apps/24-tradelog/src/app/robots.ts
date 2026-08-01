import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3024";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The signed-in app holds a customer's P&L. It is not for crawlers.
        disallow: ["/dashboard", "/journal", "/insights", "/import", "/review", "/settings", "/api"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
