import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Payment links live in inboxes and must never be crawled, so `/pay` is
 * disallowed outright as well as being noindex on the page itself.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/pay/", "/api/", "/dues", "/roster", "/issues", "/announce", "/documents", "/settings"],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
