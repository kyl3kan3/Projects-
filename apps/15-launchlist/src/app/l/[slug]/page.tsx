import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostedPageView } from "@/components/HostedPageView";
import { listBySlug, listCounters, pageUrl, recordPageView } from "@/lib/lists";
import { normalizeReferralCode } from "@/lib/referrals";
import { env } from "@/lib/env";

/**
 * The hosted launch page. Public, and the thing a launch spike actually hits.
 *
 * `force-dynamic` rather than ISR because the page carries a live joined count
 * and because `?ref=` has to be read per request. The queries behind it are two
 * indexed counts, which is what a page under load can afford; a heavier page
 * would need the ISR treatment ARCHITECTURE.md describes.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const list = await listBySlug((await params).slug);
  if (!list) return { title: "Not found" };
  const og = `${env.appUrl.replace(/\/+$/, "")}/api/og/${list.slug}`;
  return {
    title: `${list.name} — ${list.headline}`,
    description: list.subhead || `Join the ${list.name} waitlist.`,
    openGraph: {
      title: list.headline,
      description: list.subhead,
      url: pageUrl(list),
      images: [{ url: og, width: 1200, height: 630, alt: list.headline }],
    },
    twitter: { card: "summary_large_image", images: [og] },
    robots: { index: list.status !== "archived" },
  };
}

export default async function HostedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const list = await listBySlug((await params).slug);
  if (!list || list.status === "archived") notFound();

  const { ref } = await searchParams;
  const refCode = normalizeReferralCode(ref);
  const counters = await listCounters(list.id);

  // Fire-and-forget: a view is the funnel's first stage, and a failed insert
  // must never stop the page rendering.
  recordPageView(list.id).catch(() => {});

  return (
    <HostedPageView
      content={{
        slug: list.slug,
        name: list.name,
        headline: list.headline,
        subhead: list.subhead,
        ctaLabel: list.ctaLabel,
        proofLine: list.proofLine,
        template: list.template,
        theme: list.theme,
        badgeHidden: list.badgeHidden,
      }}
      joinedCount={counters.active + counters.review + counters.unsubscribed}
      refCode={refCode}
    />
  );
}
