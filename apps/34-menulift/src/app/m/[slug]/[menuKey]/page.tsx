import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestMenu, guestMetadata } from "@/components/GuestMenu";
import { loadPublicMenu, resolveMenuView } from "@/lib/menu-data";

/**
 * A guest menu pinned to one daypart — where the chips link, and what a QR
 * printed for "Brunch" encodes.
 *
 * A separate route segment rather than a query string, deliberately: reading
 * `searchParams` would make the page dynamic and give up the CDN, and this is the
 * page whose whole promise is speed.
 */
export const revalidate = 60;

/**
 * Empty on purpose. A restaurant signs up long after this deployment was built, so
 * no slug is knowable at build time — but declaring the function at all is what
 * registers this route for the full-route (ISR) cache instead of leaving it plain
 * SSR. Unknown slugs are rendered on first scan and cached from then on
 * (`dynamicParams` defaults to true).
 */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; menuKey: string }>;
}): Promise<Metadata> {
  const { slug, menuKey } = await params;
  const payload = await loadPublicMenu(slug);
  if (!payload) return { title: "Menu not found" };
  const menu = payload.menus.find((m) => m.key === menuKey);
  return guestMetadata(payload, menu?.name);
}

export default async function PinnedGuestMenuPage({
  params,
}: {
  params: Promise<{ slug: string; menuKey: string }>;
}) {
  const { slug, menuKey } = await params;
  const payload = await loadPublicMenu(slug);
  if (!payload) notFound();
  return <GuestMenu view={resolveMenuView(payload, new Date(), menuKey)} />;
}
