import type { MetadataRoute } from "next";

/**
 * Reports are private and share links are unguessable — neither belongs in an index.
 * The marketing page and the free clause checker do.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3046";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/contracts", "/flags", "/redlines", "/playbook", "/settings", "/r/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
