import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getApiBySlug, listChangelog, listSubscriptions } from "@/lib/queries";
import { hasUnfilledMigrationNote } from "@/core/changelog";
import { longDate } from "@/lib/format";
import { AppHeader, ScreenTitle } from "@/components/ScreenHeader";
import { TabBar } from "@/components/TabBar";
import { EntryEditor, type EntryView } from "./EntryEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} — changelog` };
}

export default async function ChangelogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org } = await requireUser();
  const api = await getApiBySlug(org.id, slug);
  if (!api) notFound();

  const [entries, subs] = await Promise.all([listChangelog(api.id), listSubscriptions(api.id)]);
  const verified = subs.filter((s) => s.verifiedAt && !s.unsubscribedAt).length;

  const views: EntryView[] = entries.map((entry) => ({
    id: entry.id,
    status: entry.status,
    title: entry.title,
    bodyMd: entry.bodyMd,
    breaking: entry.breaking,
    versionLabel: entry.versionLabel,
    anchor: entry.anchor,
    dateLabel: longDate(entry.publishedAt ?? entry.createdAt),
    diffId: entry.diffId,
    needsMigrationNote: hasUnfilledMigrationNote(entry.bodyMd),
  }));

  const drafts = views.filter((v) => v.status === "draft");
  const published = views.filter((v) => v.status === "published");
  // Drafts first — they are the ones with work outstanding — then published,
  // newest first within each group.
  const ordered = [...drafts, ...published];

  return (
    <>
      <AppHeader apiName={api.name} apiSlug={api.slug} />
      <main className="screen gutter" style={{ paddingTop: 24 }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <ScreenTitle
            title="Changelog"
            subtitle={`${published.length} published · ${drafts.length} draft${drafts.length === 1 ? "" : "s"} · ${verified} verified subscriber${verified === 1 ? "" : "s"}`}
          />

          <p className="t-secondary" style={{ margin: "0 0 24px" }}>
            {api.visibility === "private" ? (
              <>
                This API&apos;s changelog is private, so published entries stay in the dashboard. Change the
                visibility in <Link href={`/apis/${api.slug}/settings`}>Settings</Link> to give consumers a page.
              </>
            ) : (
              <>
                Public page:{" "}
                <Link href={`/c/${org.slug}/${api.slug}`} className="t-data">
                  /c/{org.slug}/{api.slug}
                </Link>
                {api.visibility === "unlisted" ? " (unlisted — reachable by link, not indexed)" : ""}
              </>
            )}
          </p>

          {views.length === 0 ? (
            <p className="t-body" style={{ margin: 0 }}>
              Entries are drafted automatically for any diff that is not compatible. Push a spec that changes
              something and a draft appears here, already written, waiting for your migration note.
            </p>
          ) : null}

          {/*
            One list, drafts first, each card carrying its own status.
            Splitting it into a Drafts section and a Published section moved a
            card between two different parents the moment it was published,
            which unmounts and remounts it — so the "Published." confirmation
            from the action vanished before anyone could read it.
          */}
          {ordered.length > 0 ? (
            <div className="stack" style={{ gap: 16 }}>
              {ordered.map((entry) => (
                <EntryEditor key={entry.id} slug={api.slug} entry={entry} />
              ))}
            </div>
          ) : null}
        </div>
      </main>
      <TabBar slug={api.slug} />
    </>
  );
}
