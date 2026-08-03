import type { MetadataRoute } from "next";

const base = (process.env.APP_URL ?? "http://localhost:3065").replace(/\/$/, "");

/** Only the public surfaces. Everything else is behind a session or a token. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, lastModified, changeFrequency: "monthly", priority: 0.4 },
  ];
}
