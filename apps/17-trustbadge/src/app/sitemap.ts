import type { MetadataRoute } from "next";

/** Only the public marketing surface. Everything else is behind a session or a token. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
