import type { MetadataRoute } from "next";

/**
 * Position pages and verify/unsubscribe links are personal, so they are excluded
 * here as well as being marked noindex on the page itself. Hosted launch pages
 * are very much meant to be indexed — that is the founder's whole point.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3015").replace(/\/+$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/lists", "/settings", "/verify/", "/unsubscribe/", "/l/*/joined/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
