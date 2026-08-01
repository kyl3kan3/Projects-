import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { auditVerb, queryAuditEvents, type AuditFilter } from "@/lib/audit";
import { settingsOf } from "@/lib/practices";
import { clockLocal, dayLocal } from "@/lib/format";
import { IconDownload } from "@/components/icons";

export const metadata: Metadata = { title: "Audit log" };

const CHIPS: { key: AuditFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "views", label: "Views" },
  { key: "edits", label: "Edits" },
  { key: "exports", label: "Exports" },
  { key: "sends", label: "Sends" },
];

/**
 * The ledger (DESIGN.md "Audit"): filter chips over mono rows, grouped by day.
 *
 * Exporting it is a quiet action top-right, and the export appears as the newest
 * row when the page reloads — which is the behaviour DESIGN.md asks for and also
 * the honest one. The rows are exactly what the CSV contains.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; target?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { practice } = await requireUser();
  const settings = settingsOf(practice);

  const filter = (CHIPS.find((c) => c.key === params.filter)?.key ?? "all") as AuditFilter;
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  const pageSize = 100;

  const events = await queryAuditEvents({
    practiceId: practice.id,
    filter,
    targetId: params.target,
    limit: pageSize + 1,
    offset: page * pageSize,
  });
  const hasMore = events.length > pageSize;
  const rows = events.slice(0, pageSize);

  const days: { day: string; rows: typeof rows }[] = [];
  for (const event of rows) {
    const day = dayLocal(event.createdAt, settings.timeZone);
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(event);
    else days.push({ day, rows: [event] });
  }

  const query = (next: Partial<{ filter: string; page: string }>) => {
    const search = new URLSearchParams();
    const f = next.filter ?? (filter === "all" ? "" : filter);
    if (f) search.set("filter", f);
    if (params.target) search.set("target", params.target);
    const p = next.page ?? (page > 0 ? String(page) : "");
    if (p && p !== "0") search.set("page", p);
    const s = search.toString();
    return s ? `/audit?${s}` : "/audit";
  };

  return (
    <main className="screen pt-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="t-h2">Audit log</h1>
        <a href="/api/exports/audit.csv" className="btn-quiet flex items-center gap-1">
          <IconDownload size={18} />
          Export
        </a>
      </div>
      <p className="t-secondary mb-5">
        Append-only. The database refuses UPDATE, DELETE and TRUNCATE on this table, so nothing here
        — including this app — can rewrite it. Exporting adds a row.
      </p>

      {params.target && (
        <p className="t-secondary mb-4">
          Scoped to one record.{" "}
          <Link href="/audit" className="btn-quiet">
            Show everything
          </Link>
        </p>
      )}

      <nav className="chip-row mb-4" aria-label="Filter the audit log">
        {CHIPS.map((c) => (
          <Link
            key={c.key}
            href={query({ filter: c.key === "all" ? "" : c.key, page: "0" })}
            className="chip"
            data-active={filter === c.key}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="panel p-5">
          <p className="t-title">Nothing recorded in this view yet</p>
          <p className="t-secondary mt-1">
            The log starts with your first sign-in. Sending a packet, opening one, exporting a PDF and
            signing a consent each add a row.
          </p>
        </div>
      ) : (
        days.map(({ day, rows: dayRows }) => (
          <section key={day} className="mb-6">
            <h2 className="t-label mb-1">{day}</h2>
            <ul className="list-none p-0">
              {dayRows.map((event) => (
                <li key={event.id} className="ledger-row">
                  <span>{clockLocal(event.createdAt, settings.timeZone)}</span>
                  <span className="ledger-verb">{auditVerb(event.action)}</span>
                  <span>{event.targetLabel || event.targetType}</span>
                  <span className="min-w-0 break-words">{event.actorLabel}</span>
                  {event.ip && <span style={{ color: "var(--color-ink-3)" }}>{event.ip}</span>}
                  {event.metadata && (
                    <span style={{ color: "var(--color-ink-3)" }}>
                      {Object.entries(event.metadata)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(" ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {(page > 0 || hasMore) && (
        <div className="mt-6 flex gap-3">
          {page > 0 && (
            <Link href={query({ page: String(page - 1) })} className="btn btn-secondary">
              Newer
            </Link>
          )}
          {hasMore && (
            <Link href={query({ page: String(page + 1) })} className="btn btn-secondary">
              Older
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
