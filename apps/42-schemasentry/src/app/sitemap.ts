import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { listPublicApis } from "@/lib/queries";

/**
 * The sitemap is prerendered at build time, when there is no database. A failed
 * query therefore falls back to the static routes rather than failing the build —
 * a sitemap that breaks a deploy is worse than one that is briefly short.
 *
 * Only `public` APIs appear. `unlisted` pages are reachable by link and carry a
 * noindex, which is what "unlisted" means.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${env.appUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${env.appUrl}/signup`, changeFrequency: "monthly", priority: 0.5 },
  ];

  try {
    const pages = await listPublicApis();
    return [
      ...staticRoutes,
      ...pages.map((page) => ({
        url: `${env.appUrl}/c/${page.orgSlug}/${page.apiSlug}`,
        lastModified: page.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
