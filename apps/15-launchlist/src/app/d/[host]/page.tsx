import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostedPageView } from "@/components/HostedPageView";
import { listByDomain, listCounters, pageUrl, recordPageView } from "@/lib/lists";
import { normalizeReferralCode } from "@/lib/referrals";
import { env } from "@/lib/env";

/**
 * A launch page served on the founder's own domain.
 *
 * The middleware rewrites any unrecognised host here; this route does the
 * database lookup the edge runtime cannot. Only a *verified* domain resolves
 * (see `listByDomain`) — otherwise anyone could point a CNAME at us and serve
 * someone else's page from their hostname.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string }>;
}): Promise<Metadata> {
  const list = await listByDomain(decodeURIComponent((await params).host));
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
  };
}

export default async function CustomDomainPage({
  params,
  searchParams,
}: {
  params: Promise<{ host: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const list = await listByDomain(decodeURIComponent((await params).host));
  if (!list || list.status === "archived") notFound();

  const { ref } = await searchParams;
  const counters = await listCounters(list.id);
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
      refCode={normalizeReferralCode(ref)}
    />
  );
}
