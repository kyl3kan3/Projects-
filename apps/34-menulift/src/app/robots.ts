import type { MetadataRoute } from "next";

/**
 * Guest menus are meant to be found; the dashboard, the expo board, and the API
 * are not. Prerendered, so it returns real values rather than throwing.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3034";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/m/"],
        disallow: ["/menu", "/86", "/photos", "/matrix", "/qr", "/history", "/settings", "/board/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
