import type { MetadataRoute } from "next";

/**
 * Only the pages that should be found: the marketing page and the two auth
 * entrances. Listings are per-landlord and short-lived, so they are not enumerated
 * here — the landlord shares their own link.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? "http://localhost:3044").replace(/\/$/, "");
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
