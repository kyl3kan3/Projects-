import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Only the public marketing surface. Portals are private and never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.appUrl.replace(/\/+$/, "");
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
