import type { MetadataRoute } from "next";

/**
 * Only the marketing surfaces. Individual booking pages belong to stylists and are shared
 * by them from an Instagram bio; enumerating every handle in a sitemap would turn a
 * stylist's client list into a directory, which is precisely the marketplace behaviour
 * ChairFlow exists not to be.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3058";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
