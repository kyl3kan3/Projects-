import type { MetadataRoute } from "next";

/** Only the public surfaces: the pitch, and the two doors into it. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3046";
  const lastModified = new Date("2026-08-01");
  return [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/login`, lastModified, changeFrequency: "monthly", priority: 0.3 },
  ];
}
