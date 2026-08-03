import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { BucketDot, ConsentGlyphs, EmptyState, Pill } from "@/components/ui";
import { visitValueCentsFor } from "@/lib/attribution";
import { formatMonthYear } from "@/lib/dates";
import { count, money, phoneDisplay, relativeDays } from "@/lib/format";
import { CHASE_BUCKETS, bucketLabel, monthsOverdue, type OverdueBucket } from "@/lib/recall";
import { listOverdue, overdueSummary, type OverdueFilters } from "@/server/overdue";

export const metadata: Metadata = { title: "Overdue list" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

function parseBuckets(raw: string | undefined): OverdueBucket[] {
  if (!raw) return [...CHASE_BUCKETS];
  const wanted = raw.split(",").filter((b): b is OverdueBucket => (CHASE_BUCKETS as string[]).includes(b));
  return wanted.length ? wanted : [...CHASE_BUCKETS];
}

export default async function OverduePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { practice, location } = await requireUser();
  const params = await searchParams;
  const single = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const now = new Date();
  const visitValueCents = visitValueCentsFor(practice.settings);
  const buckets = parseBuckets(single("buckets"));
  const filters: OverdueFilters = {
    buckets,
    emailable: single("emailable") === "1",
    textable: single("textable") === "1",
    contactableOnly: single("all") !== "1",
    quietForDays: single("quiet") ? Number(single("quiet")) : undefined,
    search: single("q"),
  };
  const page = Math.max(0, Number(single("page") ?? 0));

  const [summary, list] = await Promise.all([
    overdueSummary({ locationId: location.id, visitValueCents, today: now }),
    listOverdue({
      locationId: location.id,
      visitValueCents,
      filters,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      today: now,
    }),
  ]);

  const filteredValue = list.total * visitValueCents;
  const exportQuery = new URLSearchParams({
    buckets: buckets.join(","),
    ...(filters.emailable ? { emailable: "1" } : {}),
    ...(filters.textable ? { textable: "1" } : {}),
    ...(filters.contactableOnly ? {} : { all: "1" }),
    ...(filters.search ? { q: filters.search } : {}),
  }).toString();

  const campaignQuery = new URLSearchParams({ buckets: buckets.join(",") }).toString();

  return (
    <main className="screen">
      <header
        style={{
          paddingTop: 24,
          paddingBottom: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div>
          <p className="t-label" style={{ margin: 0 }}>
            Overdue for hygiene
          </p>
          <p className="t-stat" style={{ margin: "4px 0 0" }}>
            {money(filteredValue)}
          </p>
          <p className="t-secondary" style={{ margin: "4px 0 0" }}>
            {count(list.total)} of {count(summary.rosterSize)} active patients · {money(visitValueCents)} est.
            value each
          </p>
        </div>
        <Link href={`/api/exports/overdue?${exportQuery}`} className="btn-quiet" prefetch={false}>
          <Icon name="download" size={18} />
        </Link>
      </header>

      <nav
        className="scroll-x"
        aria-label="Overdue buckets"
        style={{ display: "flex", gap: 8, paddingBottom: 12, paddingTop: 4 }}
      >
        <BucketChip
          label="All overdue"
          active={buckets.length === CHASE_BUCKETS.length}
          patients={summary.totalPatients}
          href={buildHref(params, { buckets: undefined, page: undefined })}
        />
        {CHASE_BUCKETS.map((bucket) => (
          <BucketChip
            key={bucket}
            label={bucketLabel(bucket)}
            active={buckets.length === 1 && buckets[0] === bucket}
            patients={summary.byBucket[bucket].patients}
            href={buildHref(params, { buckets: bucket, page: undefined })}
          />
        ))}
      </nav>

      <div
        className="hairline-t hairline-b"
        style={{ display: "flex", gap: 8, padding: "12px 0", flexWrap: "wrap" }}
      >
        <FilterToggle
          label="Has email"
          active={Boolean(filters.emailable)}
          href={buildHref(params, { emailable: filters.emailable ? undefined : "1", page: undefined })}
        />
        <FilterToggle
          label="Has text consent"
          active={Boolean(filters.textable)}
          href={buildHref(params, { textable: filters.textable ? undefined : "1", page: undefined })}
        />
        <FilterToggle
          label="Include do-not-contact"
          active={!filters.contactableOnly}
          href={buildHref(params, { all: filters.contactableOnly ? "1" : undefined, page: undefined })}
        />
        <FilterToggle
          label="Untouched 30 days"
          active={filters.quietForDays === 30}
          href={buildHref(params, { quiet: filters.quietForDays === 30 ? undefined : "30", page: undefined })}
        />
      </div>

      {summary.noHistory > 0 && (
        <p className="t-secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          {count(summary.noHistory)} patients have no visit date in any import, so they are not counted
          as overdue. Re-import with an appointment-history column to place them.
        </p>
      )}

      {list.rows.length === 0 ? (
        <EmptyState
          icon="list-rows"
          title="Nobody matches those filters"
          body={
            summary.totalPatients === 0
              ? "No patient in this roster is more than three months past their recall date. That is a well-run schedule — or a roster that needs a fresher import."
              : "Widen the buckets or drop a consent filter. The counts on each chip show where your overdue patients actually are."
          }
          action={{ href: "/overdue", label: "Clear filters" }}
        />
      ) : (
        <section style={{ marginTop: 4 }}>
          {list.rows.map((row, index) => {
            const months = monthsOverdue(row.nextDueOn, now);
            return (
              <Link
                key={row.id}
                href={`/patients/${row.id}`}
                className="row enter"
                style={{ animationDelay: `${Math.min(index, 8) * 24}ms`, display: "flex" }}
              >
                <BucketDot bucket={row.bucket} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-title" style={{ display: "block" }}>
                    {row.firstName} {row.lastName}
                  </span>
                  <span className="t-secondary" style={{ display: "block" }}>
                    {row.lastVisitOn ? `last visit ${formatMonthYear(row.lastVisitOn)}` : "no visit on file"}
                    {row.nextDueOn ? ` · due since ${formatMonthYear(row.nextDueOn)}` : ""}
                    {months > 0 ? ` · ${months} mo` : ""}
                  </span>
                  <span className="t-secondary" style={{ display: "block" }}>
                    {row.phone ? phoneDisplay(row.phone) : "no number"}
                    {row.lastTouchAt
                      ? ` · touched ${relativeDays(Math.floor((now.getTime() - row.lastTouchAt.getTime()) / 86_400_000))}`
                      : " · never touched"}
                  </span>
                </span>
                <span style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <span className="t-mono">{money(row.valueCents)}</span>
                  {row.doNotContact ? <Pill tone="red">Do not contact</Pill> : <ConsentGlyphs patient={row} />}
                </span>
              </Link>
            );
          })}

          {list.total > PAGE_SIZE && (
            <nav style={{ display: "flex", gap: 12, paddingTop: 16, alignItems: "center" }}>
              {page > 0 && (
                <Link href={buildHref(params, { page: String(page - 1) })} className="btn btn-secondary">
                  Previous
                </Link>
              )}
              <span className="t-secondary">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, list.total)} of {count(list.total)}
              </span>
              {(page + 1) * PAGE_SIZE < list.total && (
                <Link href={buildHref(params, { page: String(page + 1) })} className="btn btn-secondary">
                  Next
                </Link>
              )}
            </nav>
          )}
        </section>
      )}

      <div className="thumb-bar">
        <Link href={`/campaigns/new?${campaignQuery}`} className="btn btn-primary">
          Start campaign
        </Link>
      </div>
    </main>
  );
}

function buildHref(
  params: Record<string, string | string[] | undefined>,
  changes: Record<string, string | undefined>,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) next.set(key, v);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `/overdue?${query}` : "/overdue";
}

function BucketChip({
  label,
  active,
  patients,
  href,
}: {
  label: string;
  active: boolean;
  patients: number;
  href: string;
}) {
  return (
    <Link href={href} className="chip chip-lg" data-active={active} aria-pressed={active}>
      {label}
      <span className="t-mono" style={{ color: active ? "var(--color-aqua-text)" : "var(--color-ink-2)" }}>
        {count(patients)}
      </span>
    </Link>
  );
}

function FilterToggle({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link href={href} className="chip" data-active={active} aria-pressed={active}>
      {active && <Icon name="check-seat" size={16} />}
      {label}
    </Link>
  );
}
