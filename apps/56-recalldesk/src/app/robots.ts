import type { MetadataRoute } from "next";

/**
 * Patient-facing token pages are never indexed: a booking link is a bearer
 * credential to one patient's record, and a search engine following one is a
 * disclosure. The console is disallowed too — it is all behind a session anyway.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3056";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/book/", "/stop/", "/dashboard", "/overdue", "/queue", "/campaigns", "/imports", "/ledger", "/settings", "/api/"],
      },
    ],
    sitemap: `${base.replace(/\/$/, "")}/sitemap.xml`,
  };
}
