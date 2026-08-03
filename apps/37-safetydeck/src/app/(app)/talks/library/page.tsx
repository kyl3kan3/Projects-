import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { libraryFor } from "@/lib/talks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconChevronRight, IconPlus } from "@/components/icons";

export const metadata: Metadata = { title: "Talk library" };

/**
 * The library. Filtering is a set of links rather than client state — a hazard
 * filter that survives a reload is worth more than one that animates.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const { company } = await requireUser();
  const all = await libraryFor(company.id);
  const tags = Array.from(new Set(all.flatMap((t) => t.hazardTags))).sort();
  const talks = tag ? all.filter((t) => t.hazardTags.includes(tag)) : all;
  const custom = all.filter((t) => t.source === "custom").length;

  return (
    <main className="screen">
      <ScreenHeader
        label="Toolbox talks"
        title={`${all.length} talks ready to read`}
        back={{ href: "/talks", label: "This week" }}
        action={
          <Link href="/talks/library/new" className="btn-quiet" style={{ minHeight: 0 }}>
            <IconPlus size={16} />
            Add
          </Link>
        }
      />

      <p className="t-secondary">
        Five minutes each, written to be read aloud outdoors. {custom > 0 ? `${custom} of them are yours. ` : ""}
        Crews get the next one in rotation each week; you can override any week&apos;s topic.
      </p>

      <div className="matrix-track mt-5 -mx-5 px-5">
        <div className="flex gap-2 pb-1">
          <Link href="/talks/library" className="chip" data-active={!tag}>
            All {all.length}
          </Link>
          {tags.map((t) => (
            <Link
              key={t}
              href={`/talks/library?tag=${encodeURIComponent(t)}`}
              className="chip"
              data-active={tag === t}
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      <section className="mt-6">
        {talks.map((talk, i) => (
          <Link
            key={talk.id}
            href={`/talks/library/${talk.slug}`}
            className="row row-in"
            style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}
          >
            <span className="min-w-0 flex-1">
              <span className="t-title block">{talk.title}</span>
              <span className="t-secondary block truncate">
                {talk.hazardTags.join(" · ")}
                {talk.source === "custom" ? " · your talk" : ""}
              </span>
            </span>
            <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
              {talk.estMinutes} MIN
            </span>
            <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
          </Link>
        ))}
        {talks.length === 0 ? (
          <p className="t-secondary py-6">
            No talks with that hazard tag. <Link href="/talks/library">Show all {all.length}</Link>.
          </p>
        ) : null}
      </section>
    </main>
  );
}
