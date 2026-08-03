import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, binderExports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { defaultRange } from "@/lib/binder";
import { monthDayYear, todayIso } from "@/lib/dates";
import { ScreenHeader } from "@/components/ScreenHeader";
import { IconDownload } from "@/components/icons";
import { ExportBinder } from "./ExportBinder";

export const metadata: Metadata = { title: "Inspection binder" };

export default async function BinderPage() {
  const { company } = await requireUser();
  const db = getDb();
  const today = todayIso(company.timezone);
  const range = defaultRange(company.timezone);

  const past = await db
    .select()
    .from(binderExports)
    .where(eq(binderExports.companyId, company.id))
    .orderBy(desc(binderExports.generatedAt))
    .limit(12);

  const trail = await db
    .select({ actor: auditLog.actor, action: auditLog.action, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(eq(auditLog.companyId, company.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(6);

  return (
    <main className="screen">
      <ScreenHeader label="The inspector moment" title="Inspection binder" settings />

      <p className="t-body" style={{ color: "var(--color-fg-2)" }}>
        One bundle with everything they ask for, in the order they ask for it: talk attendance
        with the signatures, the 300 log, the latest 300A, the cert matrix, and the incident
        list including the first-aid cases.
      </p>

      <section className="mt-8">
        <h2 className="t-label">What goes in</h2>
        <ul className="mt-2">
          <Item title="Toolbox-talk attendance" detail="One page per huddle, with each signature, both timestamps, GPS where it was captured, and any absences the foreman noted." />
          <Item title="OSHA Form 300" detail="Every recordable case for each year the range touches, with privacy cases masked per 1904.29(b)(7)." />
          <Item title="OSHA Form 300A" detail="The annual summary with its certification block, totals reconciled against the log." />
          <Item title="Cert matrix" detail="Every employee, every card, status as of the export date." />
          <Item title="Incident list" detail="All logged cases with the recordability determination and its citation." />
        </ul>
      </section>

      <ExportBinder defaultFrom={range.start} defaultTo={range.end} today={today} />

      <section className="mt-10">
        <h2 className="t-label">Past exports</h2>
        <div className="mt-2">
          {past.map((row) => (
            <a key={row.id} className="row" href={`/api/binder/${row.id}`} target="_blank" rel="noreferrer">
              <IconDownload size={18} style={{ color: "var(--color-hardhat)" }} />
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">
                  {monthDayYear(row.rangeStart)} — {monthDayYear(row.rangeEnd)}
                </span>
                <span className="t-secondary block truncate">
                  {row.pageCount} pages · {row.contents.signatures} signatures ·{" "}
                  {row.contents.recordableIncidents} recordable · requested by {row.requestedBy}
                </span>
              </span>
              <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                {row.generatedAt.toISOString().slice(0, 10)}
              </span>
            </a>
          ))}
          {past.length === 0 ? (
            <p className="t-secondary py-4">
              No exports yet. The first one takes a few seconds and is worth doing before you
              need it — the point of this button is that it already works when someone is
              standing in your parking lot.
            </p>
          ) : null}
        </div>
      </section>

      {trail.length > 0 ? (
        <section className="mt-10">
          <h2 className="t-label">Audit trail</h2>
          <p className="t-secondary mt-2">
            Every export and download is logged with who did it and when. These documents end up
            in legal proceedings; the chain of custody matters.
          </p>
          <div className="mt-3">
            {trail.map((row, i) => (
              <div key={i} className="rule-b flex items-baseline justify-between gap-3 py-2">
                <span className="t-secondary truncate">
                  {row.action} · {row.actor}
                </span>
                <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                  {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Item({ title, detail }: { title: string; detail: string }) {
  return (
    <li className="rule-b py-3">
      <p className="t-title">{title}</p>
      <p className="t-secondary mt-1">{detail}</p>
    </li>
  );
}
