import type { MetadataRoute } from "next";

/**
 * The marketing pages only. Guest menus are not listed: a restaurant's menu URL
 * is theirs to hand out, and a directory of every customer's slug is not a thing
 * this product should publish.
 *
 * Prerendered at build time, so it must not touch the database.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3034";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
