import type { MetadataRoute } from "next";

/**
 * The landing page and public listings are meant to be found. Everything a token
 * unlocks — a tenant's rent page, an applicant's screening authorisation, a lease —
 * must never be indexed, and those pages also set robots headers themselves.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3044";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/apply/"],
        disallow: ["/t/", "/screen/", "/sign/", "/api/", "/units", "/rent", "/requests", "/file", "/applications", "/tenancies", "/settings"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
