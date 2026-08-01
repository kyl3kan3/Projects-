import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Only the public marketing surface. Everything else is behind a login or a token. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: env.appUrl, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${env.appUrl}/signup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${env.appUrl}/login`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
  ];
}
