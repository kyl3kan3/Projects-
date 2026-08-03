import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Prerendered, so it returns real values. Everything behind a session is excluded — a
 * report route in a search index would be a customer's emissions data on the open web.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/footprint",
          "/documents",
          "/review",
          "/spend",
          "/report",
          "/answers",
          "/audit",
          "/settings",
          "/onboarding",
          "/api",
        ],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
