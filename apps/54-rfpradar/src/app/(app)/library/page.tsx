import type { Metadata } from "next";
import Link from "next/link";
import { requireFirm } from "@/lib/auth";
import { hasResponseWorkspace, plan } from "@/lib/plans";
import { getBlock, isStale, libraryStats, listBlocks, listTags } from "@/lib/library";
import { blockKindLabel, formatDayYear } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { BooksRow, Download, FlagSmall, Search } from "@/components/icons";
import { BlockForm } from "./BlockForm";
import { archiveBlockAction, reviewBlockAction } from "./actions";
import type { AnswerBlock } from "@/db/schema";

export const metadata: Metadata = { title: "Answer library" };

const KIND_CHIPS: Array<{ key: AnswerBlock["kind"] | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "boilerplate", label: "Boilerplate" },
  { key: "past_answer", label: "Answers" },
  { key: "bio", label: "Bios" },
  { key: "past_performance", label: "Past performance" },
  { key: "attachment_ref", label: "Attachments" },
];

/**
 * /library — the firm's proposal memory.
 *
 * Block cards carry the kind label, the won-with flag, the title, three lines of
 * body, and mono meta ("v4 · reviewed Jan 2026"). A stale block gets an amber
 * "REVIEW BEFORE USE" label — computed as of now, not read from the stored flag
 * the weekly job maintains, so a bio last reviewed in 2024 cannot render as fresh
 * because a cron missed a week.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string; tag?: string; sort?: string; edit?: string }>;
}) {
  const { firm, access } = await requireFirm();
  const { kind, q, tag, sort, edit } = await searchParams;
  const now = new Date();

  if (!hasResponseWorkspace(access.planId)) {
    return (
      <main className="pt-4">
        <h1 className="t-h2">Answer library</h1>
        <div className="card p-4 mt-4">
          <p className="t-body">
            {plan(access.planId).name} covers discovery. The answer library — boilerplate, past
            answers, bios and past-performance blurbs, with link-and-snapshot into pursuits — starts
            on Pursuit.
          </p>
          <Link href="/settings/billing" className="btn btn-primary w-full mt-4">
            See plans
          </Link>
        </div>
      </main>
    );
  }

  const activeKind = KIND_CHIPS.find((chip) => chip.key === kind)?.key ?? "all";
  const staleFirst = sort === "stale";
  const blocks = await listBlocks(firm.id, {
    kind: activeKind === "all" ? undefined : activeKind,
    query: q,
    tag,
    staleFirst,
  });
  const [stats, tags] = await Promise.all([libraryStats(firm.id, now), listTags(firm.id)]);
  const editing = edit ? await getBlock(firm.id, edit) : null;

  return (
    <main className="pt-4">
      <h1 className="t-h2">Answer library</h1>
      <p className="t-secondary mt-2">
        {stats.total} block{stats.total === 1 ? "" : "s"} · {stats.stale} needing review ·{" "}
        {stats.wonWith} flagged as winning answers
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <a href="/api/library/export" className="btn-quiet" download>
          <Download size={18} /> Export everything
        </a>
        <Link href={staleFirst ? "/library" : "/library?sort=stale"} className="btn-quiet">
          {staleFirst ? "Newest first" : "Stale first"}
        </Link>
      </div>

      <form className="mt-4 flex gap-2" action="/library">
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search titles, text, and tags"
          aria-label="Search the library"
        />
        <button className="btn btn-secondary" type="submit" aria-label="Search">
          <Search size={20} />
        </button>
      </form>

      <nav className="mt-3 flex gap-2 scroll-x" aria-label="Filter by kind">
        {KIND_CHIPS.map((chip) => (
          <Link
            key={chip.key}
            href={chip.key === "all" ? "/library" : `/library?kind=${chip.key}`}
            className="chip"
            aria-current={activeKind === chip.key ? "true" : undefined}
          >
            {chip.label}
          </Link>
        ))}
      </nav>

      {tags.length > 0 && (
        <nav className="mt-2 flex gap-2 scroll-x" aria-label="Filter by tag">
          {tags.slice(0, 12).map((row) => (
            <Link
              key={row.tag}
              href={tag === row.tag ? "/library" : `/library?tag=${encodeURIComponent(row.tag)}`}
              className="chip"
              aria-current={tag === row.tag ? "true" : undefined}
            >
              {row.tag} <span className="t-mono">{row.count}</span>
            </Link>
          ))}
        </nav>
      )}

      <section className="mt-5 flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
        {blocks.map((block) => {
          const stale = isStale(block.lastReviewedAt, now);
          return (
            <article key={block.id} className="card p-4">
              <div className="flex items-start gap-2">
                <p className="t-label flex-1">{blockKindLabel(block.kind)}</p>
                {block.wonWith && (
                  <span
                    className="t-label flex items-center gap-1"
                    style={{ color: "var(--color-green-text)" }}
                    title="Used in a pursuit this firm won"
                  >
                    <FlagSmall size={16} /> won with
                  </span>
                )}
              </div>
              <h2 className="t-title mt-1">{block.title}</h2>
              <p className="t-body mt-2 line-clamp-3" style={{ color: "var(--color-ink-2)" }}>
                {block.body}
              </p>
              <p className="t-mono mt-3" style={{ color: "var(--color-ink-3)" }}>
                v{block.version} ·{" "}
                {block.lastReviewedAt
                  ? `reviewed ${formatDayYear(block.lastReviewedAt, firm.timezone)}`
                  : "never reviewed"}
                {block.tags.length > 0 ? ` · ${block.tags.join(" ")}` : ""}
              </p>

              {stale && (
                <p className="t-label mt-2" style={{ color: "var(--color-amber-text)" }}>
                  Review before use
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <Link href={`/library?edit=${block.id}`} className="btn-quiet">
                  Edit
                </Link>
                <form action={reviewBlockAction}>
                  <input type="hidden" name="id" value={block.id} />
                  <button className="btn-quiet" type="submit">
                    Still accurate
                  </button>
                </form>
                <details className="ml-auto">
                  <summary
                    className="btn-quiet cursor-pointer list-none"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    Archive
                  </summary>
                  <div className="mt-2" style={{ minWidth: 220 }}>
                    {/* Destructive, so hold-to-confirm and audit-logged
                        (DESIGN.md, Motion & touch). A block that quietly vanishes
                        from a shared library gets noticed at 11pm the night
                        before a submission. */}
                    <HoldToConfirm
                      action={archiveBlockAction}
                      hiddenFields={{ id: block.id, archived: "1" }}
                      label="Hold to archive"
                      holdingLabel="Archiving…"
                      tone="danger"
                    />
                  </div>
                </details>
              </div>
            </article>
          );
        })}
      </section>

      {blocks.length === 0 && (
        <section className="card p-4 mt-5">
          {q || tag || activeKind !== "all" ? (
            <p className="t-body">
              Nothing matches that filter. The search covers titles, body text, and tags.
            </p>
          ) : (
            <>
              <p className="t-body">
                <BooksRow size={20} /> The library is empty. Paste three things from your last
                proposal — the company overview, one past-performance blurb, and a team bio — and the
                next response starts from those instead of a blank page.
              </p>
              <p className="t-secondary mt-2">
                Blocks link into pursuits by snapshot: the pursuit freezes the text it used, and the
                library keeps improving.
              </p>
            </>
          )}
        </section>
      )}

      <StatusPillLegend stale={stats.stale} />

      <section className="mt-8">
        <h2 className="t-h2">{editing ? `Edit “${editing.title}”` : "New block"}</h2>
        <div className="mt-3">
          <BlockForm block={editing ?? undefined} />
        </div>
        {editing && (
          <Link href="/library" className="btn-quiet mt-3">
            Cancel editing
          </Link>
        )}
      </section>
    </main>
  );
}

function StatusPillLegend({ stale }: { stale: number }) {
  if (stale === 0) return null;
  return (
    <p className="t-secondary mt-5 flex items-center gap-2">
      <StatusPill label={`${stale} stale`} tone="warn" /> Unreviewed for over a year. They still link
      into pursuits — the warning travels with them.
    </p>
  );
}
