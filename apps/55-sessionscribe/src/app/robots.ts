import type { MetadataRoute } from "next";

const base = (
  process.env.APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3055"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The product surfaces are behind auth; keeping them out of the index is
        // belt and braces on a PHI-bearing app.
        disallow: ["/today", "/capture", "/notes", "/clients", "/trust", "/settings", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
