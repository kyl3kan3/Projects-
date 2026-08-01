import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Client portals must never be crawled. They are private by cookie already, but a
 * portal URL that lands in a shared inbox should not end up in an index either.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/p/", "/portal/", "/portal-expired", "/api/", "/dashboard", "/settings"],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
