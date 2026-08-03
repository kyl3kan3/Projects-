import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicChangelog } from "@/lib/queries";
import { longDate } from "@/lib/format";
import { env } from "@/lib/env";
import { Markdown } from "@/lib/markdown";
import { BrandMark } from "@/components/icons";
import { SubscribeForm } from "./SubscribeForm";

/**
 * The public consumer-facing changelog.
 *
 * DESIGN.md is emphatic that this is "a document, not an app": a single ≤65ch
 * column at every size, magazine-set on carbon, breaking entries leading with a
 * 2px break left rule, mono version anchors, and the "Watched by SchemaSentry"
 * footer mark that closes the distribution loop.
 *
 * Rendered on demand rather than statically generated. ARCHITECTURE.md asks for
 * SSG + revalidate, which is right at page volume, but a changelog showing a
 * stale entry the moment after someone published is exactly the failure this
 * product exists to prevent — so correctness first, caching when it matters.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; slug: string }>;
}): Promise<Metadata> {
  const { org, slug } = await params;
  const data = await getPublicChangelog(org, slug);
  if (!data) return { title: "Changelog not found" };
  return {
    title: `${data.api.name} changelog`,
    description: `Breaking changes, migration notes and release history for ${data.api.name}.`,
    robots: data.api.visibility === "public" ? undefined : { index: false, follow: false },
    alternates: {
      types: { "application/rss+xml": `${env.appUrl}/c/${org}/${slug}/rss.xml` },
    },
  };
}

export default async function PublicChangelogPage({
  params,
}: {
  params: Promise<{ org: string; slug: string }>;
}) {
  const { org: orgSlug, slug } = await params;
  const data = await getPublicChangelog(orgSlug, slug);
  if (!data) notFound();

  const { org, api, entries } = data;
  const feedUrl = `${env.appUrl}/c/${org.slug}/${api.slug}/rss.xml`;

  return (
    <main className="gutter" style={{ paddingBlock: 56 }}>
      <div style={{ maxWidth: "65ch", marginInline: "auto" }}>
        <header style={{ marginBottom: 56 }}>
          <p className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 8px" }}>
            {org.name}
          </p>
          <h1 className="t-h2" style={{ margin: "0 0 8px", fontSize: 28 }}>
            {api.name} changelog
          </h1>
          <p className="t-secondary" style={{ margin: 0 }}>
            Every change to this API&apos;s contract, with migration notes. Breaking changes are marked.
          </p>
        </header>

        {entries.length === 0 ? (
          <p className="t-body">
            Nothing published yet. Subscribe below and the first entry lands in your inbox rather than in a support
            ticket.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 56 }}>
            {entries.map((entry) => (
              <article key={entry.id} id={entry.anchor} className={entry.breaking ? "entry-breaking" : undefined}>
                <p className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 8px" }}>
                  {longDate(entry.publishedAt ?? entry.createdAt)}
                  {entry.breaking ? (
                    <>
                      {" · "}
                      <span className="level-label" data-level="breaking">
                        Breaking
                      </span>
                    </>
                  ) : null}
                </p>
                <h2 className="t-h2" style={{ margin: "0 0 4px", fontSize: 22 }}>
                  <a href={`#${entry.anchor}`} style={{ color: "var(--color-text)" }}>
                    {entry.title}
                  </a>
                </h2>
                <p className="t-data" style={{ color: "var(--color-text-2)", margin: "0 0 16px" }}>
                  {entry.versionLabel}
                </p>
                <div className="doc">
                  <Markdown source={entry.bodyMd} />
                </div>
              </article>
            ))}
          </div>
        )}

        <SubscribeForm orgSlug={org.slug} apiSlug={api.slug} feedUrl={feedUrl} />

        <footer className="hairline-t" style={{ marginTop: 56, paddingTop: 20 }}>
          <p
            className="t-secondary"
            style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-2)" }}
          >
            <BrandMark size={18} />
            Watched by{" "}
            <a href={`${env.appUrl}/?ref=changelog&api=${api.slug}`} rel="noopener">
              SchemaSentry
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
