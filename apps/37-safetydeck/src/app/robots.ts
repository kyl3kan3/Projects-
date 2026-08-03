import type { MetadataRoute } from "next";

/**
 * Crew links are capability URLs — an indexed crew link is a leaked crew link —
 * so /crew is disallowed outright along with the API and every signed-in screen.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3037";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/crew/",
          "/talks",
          "/incidents",
          "/certs",
          "/binder",
          "/settings",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
