import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { groupByMonth, listDocuments, sortForQueue, type DocumentRow } from "@/lib/documents";
import { canUploadDocument } from "@/lib/plans";
import { pendingJobCount } from "@/lib/jobs";
import { JobRunner } from "@/components/JobRunner";
import { UploadDrop } from "./UploadDrop";
import {
  IconCheck,
  IconFileStack,
  IconMagnifier,
  IconTable,
} from "@/components/icons";
import { CATEGORY_LABEL, formatConfidenceBp, formatQuantityMilli } from "@/lib/units";
import { extractorIsLive } from "@/lib/extraction";
import { driverKind } from "@/lib/storage";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

const SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function periodText(startIso: string, endIso: string): string {
  const [, sm, sd] = startIso.split("-");
  const [, em, ed] = endIso.split("-");
  return sm === em
    ? `${SHORT[Number(sm) - 1]} ${sd}–${ed}`
    : `${SHORT[Number(sm) - 1]} ${sd} – ${SHORT[Number(em) - 1]} ${ed}`;
}

export default async function DocumentsPage() {
  const { org, period } = await requireOnboarded();
  const db = getDb();
  const siteRows = await db.select().from(sites).where(eq(sites.organizationId, org.id));
  const rows = await listDocuments(period.id);
  const gate = canUploadDocument(org.plan, rows.length);
  const pending = await pendingJobCount(org.id);

  const queue = sortForQueue(rows);
  const needsReview = queue.filter((r) => r.doc.status === "needs_review");
  const rest = queue.filter((r) => r.doc.status !== "needs_review");
  const grouped = groupByMonth(rest);

  return (
    <main className="screen pt-5">
      <h1 className="t-h2">Documents</h1>
      <p className="t-secondary mt-1">
        {rows.length === 0
          ? "Nothing uploaded yet."
          : `${rows.length} in reporting year ${period.year} · ${needsReview.length} awaiting review`}
      </p>

      {period.lockedAt ? (
        <div className="panel mt-5 p-4">
          <p className="t-label">Year locked</p>
          <p className="t-body mt-2">
            Reporting year {period.year} is locked, so its figures are frozen. Unlock it on
            the report screen to add documents.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <UploadDrop
            sites={siteRows.map((s) => ({ id: s.id, name: s.name }))}
            disabled={!gate.allowed}
            disabledReason={gate.reason}
          />
          <Link
            href="/spend"
            className="btn-quiet mt-4 inline-flex items-center gap-2"
          >
            <IconTable size={16} />
            Go to the spend import
          </Link>
        </div>
      )}

      <JobRunner pending={pending} label="READING" />

      {!extractorIsLive() && (
        <p className="t-secondary mt-4" style={{ maxWidth: "52ch" }}>
          No extraction model is configured on this deployment, so bills are read from their
          PDF text layer. A scanned or photographed bill will arrive in review with its
          fields empty for you to type in — never with a guessed number.
        </p>
      )}

      {needsReview.length > 0 && (
        <section className="mt-8">
          <h2 className="t-label" style={{ color: "var(--color-amber-text)" }}>
            Needs review · {needsReview.length}
          </h2>
          {needsReview.map((row, i) => (
            <DocRow key={row.doc.id} row={row} index={i} />
          ))}
        </section>
      )}

      {grouped.map((group) => (
        <section key={group.key} className="mt-8">
          <h2 className="t-label">{group.label}</h2>
          {group.rows.map((row, i) => (
            <DocRow key={row.doc.id} row={row} index={i} />
          ))}
        </section>
      ))}

      {rows.length === 0 && (
        <section className="mt-8">
          <h2 className="t-label">What lands here</h2>
          <div className="row-plain">
            <p className="t-title">March electricity — Consolidated Edison</p>
            <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
              4,182 kWh · MAR 01–31 · read at 99%
            </p>
          </div>
          <div className="row-plain">
            <p className="t-title">November gas — National Grid</p>
            <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
              812 therms → 23,792 kWh · NOV 01–30
            </p>
          </div>
          <p className="t-secondary mt-3" style={{ maxWidth: "50ch" }}>
            Two examples of what a read bill looks like. Nothing above is in your account —
            the footprint stays at zero until your own bills are in.
          </p>
        </section>
      )}

      <p className="t-secondary mt-8">
        Originals are stored{" "}
        {driverKind() === "r2" ? "in object storage" : "in your database"} and served only
        through short-lived signed links.
      </p>

    </main>
  );
}

function DocRow({ row, index }: { row: DocumentRow; index: number }) {
  const { doc, lines } = row;
  const first = lines[0];
  const summary =
    lines.length > 0
      ? lines
          .map(
            (l) =>
              `${formatQuantityMilli(l.quantityMilli)} ${l.unit}${
                l.sourceUnit && l.sourceUnit !== l.unit ? ` (${l.sourceQuantity} ${l.sourceUnit})` : ""
              }`,
          )
          .join(" · ")
      : "no reading yet";

  const title =
    lines.length > 0
      ? `${CATEGORY_LABEL[first.category]} — ${first.provider || doc.filename}`
      : doc.filename;

  const status = doc.status;
  const extracting = status === "extracting" || status === "uploaded";

  const body = (
    <>
      <span style={{ color: "var(--color-fg-2)" }}>
        <IconFileStack size={20} />
      </span>
      <span className="min-w-0">
        <span className="t-title block truncate">{title}</span>
        <span className="t-data mt-1 block" style={{ color: "var(--color-fg-2)" }}>
          {first ? `${summary} · ${periodText(first.serviceStart, first.serviceEnd)}` : summary}
          {row.siteName !== "—" ? ` · ${row.siteName}` : ""}
        </span>
        {extracting && (
          <>
            <span className="extracting-bar mt-2" aria-hidden="true" />
            <span className="t-data mt-1 block" style={{ color: "var(--color-fg-2)" }}>
              EXTRACTING
            </span>
          </>
        )}
        {status === "needs_review" && doc.error && (
          <span className="t-secondary mt-1 block" style={{ color: "var(--color-amber-text)" }}>
            {doc.error}
          </span>
        )}
        {status === "rejected" && (
          <span className="t-secondary mt-1 block" style={{ color: "var(--color-red)" }}>
            Rejected{doc.error ? ` — ${doc.error}` : ""}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 justify-self-end">
        {status === "accepted" && (
          <>
            <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
              {doc.confidenceBp !== null ? formatConfidenceBp(doc.confidenceBp) : "—"}
            </span>
            <span className="mark-accepted" aria-hidden="true">
              <IconCheck size={18} />
            </span>
            <span className="sr-only">Accepted</span>
          </>
        )}
        {status === "needs_review" && (
          <>
            <span className="t-data" style={{ color: "var(--color-amber-text)" }}>
              REVIEW
            </span>
            <span className="mark-review" aria-hidden="true">
              <IconMagnifier size={18} />
            </span>
          </>
        )}
        {status === "rejected" && (
          <span className="t-data" style={{ color: "var(--color-red)" }}>
            REJECTED
          </span>
        )}
        {extracting && (
          <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
            READING
          </span>
        )}
      </span>
    </>
  );

  if (doc.kind === "spend_csv") {
    return (
      <Link href="/spend" className="row row-in" data-i={Math.min(index, 7)}>
        <span style={{ color: "var(--color-fg-2)" }}>
          <IconTable size={20} />
        </span>
        <span className="min-w-0">
          <span className="t-title block truncate">{doc.filename}</span>
          <span className="t-data mt-1 block" style={{ color: "var(--color-fg-2)" }}>
            SPEND IMPORT
          </span>
        </span>
        <span className="t-data justify-self-end" style={{ color: "var(--color-fg-2)" }}>
          OPEN
        </span>
      </Link>
    );
  }

  return (
    <Link href={`/review/${doc.id}`} className="row row-in" data-i={Math.min(index, 7)}>
      {body}
    </Link>
  );
}
