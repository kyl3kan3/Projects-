import type { MetadataRoute } from "next";

/**
 * The marketing page is the only thing worth indexing. Signing links, the kiosk
 * and the whole staff app hold personal data about named people, some of them
 * minors — none of it belongs in a search index.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3050";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/sign/", "/kiosk/", "/api/", "/checkin", "/participants", "/waivers", "/incidents", "/settings"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
