import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3057";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The console, the kiosk and the simulated hosted pages are never
        // indexable: one needs a session, one a device token, and the third
        // should not exist in production at all.
        disallow: ["/roster", "/gradings", "/retention", "/billing", "/curriculum", "/schedule", "/announce", "/settings", "/setup", "/kiosk", "/hosted", "/api"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
