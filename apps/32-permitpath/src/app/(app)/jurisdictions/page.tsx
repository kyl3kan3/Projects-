import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { CoveragePill } from "@/components/StatusPill";
import { WatchButton } from "@/components/WatchButton";
import { requireUser } from "@/lib/auth";
import { coverageSummary, countWatches, listJurisdictions } from "@/lib/jurisdictions";
import { checkWatches } from "@/lib/plans";
import type { CoverageStatus } from "@/db/schema";

export const metadata: Metadata = { title: "Jurisdictions" };

const FILTERS: { label: string; value: CoverageStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Curated", value: "curated" },
  { label: "Partial", value: "partial" },
];

/**
 * The coverage map, sold honestly: how many authorities, how many records, and how
 * many of those were verified inside the last 90 days. A map, not a promise.
 */
export default async function JurisdictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; coverage?: string }>;
}) {
  const { q, coverage } = await searchParams;
  const { org } = await requireUser();
  const filter = FILTERS.find((f) => f.value === coverage)?.value ?? "all";

  const [summary, list, watchCount] = await Promise.all([
    coverageSummary(),
    listJurisdictions({
      organizationId: org.id,
      search: q ?? null,
      coverage: filter === "all" ? null : filter,
    }),
    countWatches(org.id),
  ]);
  const gate = checkWatches(org.plan, watchCount);

  return (
    <main className="screen pt-6">
      <h1 className="t-h2">Jurisdictions</h1>
      <p className="t-secondary mt-2">
        {summary.jurisdictions} authorities across the Phoenix metro · {summary.curated} curated
        end to end.
      </p>
      <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
        {summary.freshRecords} of {summary.records} records verified in the last 90 days ·{" "}
        {watchCount} of {gate.limit} watched
      </p>

      <form action="/jurisdictions" className="mt-5">
        <label className="block">
          <span className="sr-only">Search jurisdictions</span>
          <input
            className="input"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Mesa, Pinal, Gila River…"
          />
        </label>
        {filter !== "all" && <input type="hidden" name="coverage" value={filter} />}
      </form>

      <div className="chiprow mt-4">
        {FILTERS.map((option) => (
          <Link
            key={option.value}
            href={{
              pathname: "/jurisdictions",
              query: {
                ...(q ? { q } : {}),
                ...(option.value === "all" ? {} : { coverage: option.value }),
              },
            }}
            className="chip"
            data-active={filter === option.value}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="t-body mt-6">
          No authority matches “{q}”. The launch corpus covers Maricopa and Pinal counties; ask for
          your metro next and the waitlist votes decide the order.
        </p>
      ) : (
        <ul className="mt-4">
          {list.map((item, index) => (
            <li
              key={item.jurisdiction.id}
              className="row row-in"
              style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
            >
              <span className="min-w-0 flex-1">
                <Link
                  href={`/jurisdictions/${item.jurisdiction.slug}`}
                  className="t-title block"
                  style={{ color: "var(--color-fg)" }}
                >
                  {item.jurisdiction.name}
                </Link>
                <span className="t-secondary block truncate">
                  {item.jurisdiction.departmentName}
                  {item.jurisdiction.contact.phone ? ` · ${item.jurisdiction.contact.phone}` : ""}
                </span>
                <span className="t-data mt-1 block" style={{ color: "var(--color-fg-3)" }}>
                  {item.recordCount} job {item.recordCount === 1 ? "type" : "types"} on record
                </span>
                <span className="mt-1 block">
                  <WatchButton
                    jurisdictionId={item.jurisdiction.id}
                    slug={item.jurisdiction.slug}
                    watched={item.watched}
                  />
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <CoveragePill coverage={item.jurisdiction.coverageStatus} />
                <Link href={`/jurisdictions/${item.jurisdiction.slug}`} aria-label={item.jurisdiction.name}>
                  <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
