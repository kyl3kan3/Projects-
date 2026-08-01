import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listCounters, ownedList, pageUrl } from "@/lib/lists";
import { ListHeader } from "@/components/ListHeader";
import { BuilderClient } from "./BuilderClient";
import { EmbedSnippets } from "./EmbedSnippets";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Page builder" };
export const dynamic = "force-dynamic";

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireUser();
  const list = await ownedList(user.id, (await params).id);
  if (!list) notFound();
  const { created } = await searchParams;
  const counters = await listCounters(list.id);
  const appBase = env.appUrl.replace(/\/+$/, "");

  return (
    <main className="screen">
      <ListHeader
        list={list}
        section="Page"
        detail={
          created ? (
            <p className="t-secondary" role="status" style={{ color: "var(--color-mint)" }}>
              Your page is live. Edit it here — every change is visible the moment you save.
            </p>
          ) : undefined
        }
      />

      <BuilderClient
        listId={list.id}
        joinedCount={counters.active + counters.review + counters.unsubscribed}
        initial={{
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
      />

      <section style={{ marginTop: 40 }}>
        <p className="t-label">Link preview</p>
        <p className="t-secondary" style={{ marginTop: 8 }}>
          Generated from the page, so it can never fall out of date. This is what shows up when the
          link is pasted into X, Slack or iMessage.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/og/${list.slug}`}
          alt={`Link preview for ${list.name}: ${list.headline}`}
          width={1200}
          height={630}
          style={{
            width: "100%",
            height: "auto",
            marginTop: 12,
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--color-hairline)",
          }}
        />
      </section>

      <EmbedSnippets listSlug={list.slug} appBase={appBase} pageUrl={pageUrl(list)} />
    </main>
  );
}
