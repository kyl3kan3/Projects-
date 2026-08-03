import type { MetadataRoute } from "next";

/**
 * The landing page is meant to be found. Everything a token unlocks — a tenant's
 * lease, their balance, their receipts — must never be indexed, and /t also sets
 * robots headers on the page itself.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? "http://localhost:3069").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/signup", "/login"],
        disallow: ["/t/", "/api/", "/map", "/units", "/delinquency", "/liens", "/rates", "/reports", "/settings"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
