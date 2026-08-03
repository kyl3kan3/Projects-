import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Only the public marketing surface. Everything behind a session is not indexable. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-08-01");
  return [
    { url: `${env.appUrl}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${env.appUrl}/login`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${env.appUrl}/signup`, lastModified, changeFrequency: "yearly", priority: 0.5 },
  ];
}
