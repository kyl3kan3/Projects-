import type { MetadataRoute } from "next";

const base = process.env.APP_URL ?? "http://localhost:3060";

/**
 * The customer quote pages are bearer-token URLs; they must never be crawled, and
 * neither should the signed-in app.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/q/", "/api/", "/dashboard", "/orders", "/items", "/runs", "/returns", "/customers", "/settings", "/calendar"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
