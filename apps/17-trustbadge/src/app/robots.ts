import type { MetadataRoute } from "next";

/**
 * The tokenised review form and the widget API are deliberately disallowed: a
 * crawler following a review link would put an order's contents in a public index,
 * and crawling the JSON API wastes cache entries on nobody's behalf.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/r/", "/api/", "/home", "/reviews", "/widgets", "/settings"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
