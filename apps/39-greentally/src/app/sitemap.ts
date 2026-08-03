import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Only the public marketing surface. Nothing behind a session is indexable. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-08-01");
  return [
    { url: `${env.appUrl}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${env.appUrl}/signup`, lastModified, changeFrequency: "yearly", priority: 0.6 },
    { url: `${env.appUrl}/login`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
