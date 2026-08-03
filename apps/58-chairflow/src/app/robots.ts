import type { MetadataRoute } from "next";

/**
 * The dashboard, the client-facing token links and the booking-page confirmation are all
 * private surfaces: a manage link is a bearer credential, and an indexed one is a leak.
 * The marketing page and the public booking pages are the only crawlable things here.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3058";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/b/"],
        disallow: ["/a/", "/w/", "/today", "/clients", "/ledger", "/rent", "/settings", "/setup", "/page", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
