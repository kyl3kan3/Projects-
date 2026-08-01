import type { MetadataRoute } from "next";

const base = process.env.APP_URL ?? "http://localhost:3043";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Signed client links and the firm's own screens are never indexable.
        disallow: ["/portal/", "/aging", "/invoices", "/approvals", "/promises", "/forecast", "/clients", "/connect", "/settings", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
