import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Family links and registration pages live in inboxes and group chats. They are
 * noindex on the page too, but a crawler should not even try.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/p/",
          "/print/",
          "/register/",
          "/checkout/",
          "/api/",
          "/season",
          "/registrations",
          "/rosters",
          "/schedule",
          "/comms",
          "/volunteers",
          "/settings",
        ],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
