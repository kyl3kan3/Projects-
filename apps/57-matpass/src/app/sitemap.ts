import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3057";

/** Only the three pages a stranger can reach without a credential. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
