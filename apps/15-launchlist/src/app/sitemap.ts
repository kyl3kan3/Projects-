import type { MetadataRoute } from "next";

/**
 * The marketing surface only. Hosted launch pages are deliberately absent: they
 * belong to founders, some are unlisted before a launch, and publishing a
 * directory of everyone's unlaunched product would be a breach of that.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3015").replace(/\/+$/, "");
  const lastModified = new Date();
  return [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
