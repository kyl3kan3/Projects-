import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestMenu, guestMetadata } from "@/components/GuestMenu";
import { loadPublicMenu, resolveMenuView } from "@/lib/menu-data";

/**
 * The QR target. ISR with a 60-second window so a scan is CDN HTML, plus explicit
 * purging from every write a guest can see — an 86 calls `revalidatePath` on this
 * exact path, so the next scan regenerates in under a second rather than waiting
 * out the window. See src/lib/menu-data.ts.
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
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const payload = await loadPublicMenu((await params).slug);
  if (!payload) return { title: "Menu not found" };
  return guestMetadata(payload);
}

export default async function GuestMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const payload = await loadPublicMenu(slug);
  if (!payload) notFound();
  return <GuestMenu view={resolveMenuView(payload, new Date())} />;
}
