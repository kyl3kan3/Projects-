import type { MetadataRoute } from "next";

const base = (process.env.APP_URL ?? "http://localhost:3065").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Party portals are unlisted capability URLs and the console is private.
        disallow: ["/p/", "/deals", "/templates", "/commissions", "/settings", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
