import type { MetadataRoute } from "next";

/**
 * The ICS feed is a capability URL: an indexed calendar is a leaked calendar, so
 * /api is disallowed outright along with every signed-in screen.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3049";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/pipeline",
          "/discovery",
          "/calendar",
          "/library",
          "/settings",
          "/onboarding",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
