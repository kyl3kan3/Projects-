import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requirementChanges } from "@/db/schema";
import { IconArrowLeft } from "@/components/icons";
import { RecordEditor } from "./RecordEditor";
import { requireCurator } from "@/lib/auth";
import { longDate } from "@/lib/format";
import { getRecordById } from "@/lib/requirements";
import { jobTypeLabel } from "@/lib/taxonomy";

export const metadata: Metadata = { title: "Record editor" };

export default async function RecordEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ recordId: string }>;
  searchParams: Promise<{ changeId?: string }>;
}) {
  await requireCurator();
  const { recordId } = await params;
  const { changeId } = await searchParams;

  const context = await getRecordById(recordId);
  if (!context) notFound();
  const { record, jurisdiction } = context;

  let prefillSummary = "";
  if (changeId) {
    const db = getDb();
    const [change] = await db
      .select()
      .from(requirementChanges)
      .where(eq(requirementChanges.id, changeId));
    if (change) prefillSummary = change.diffSummary;
  }

  return (
    <main className="screen screen-wide pt-6">
      <Link href={changeId ? "/admin/review" : "/admin"} className="btn-quiet btn-quiet-sm">
        <IconArrowLeft size={18} />
        {changeId ? "Review queue" : "Curation"}
      </Link>

      <h1 className="t-h2 mt-4">
        {jurisdiction.name} — {jobTypeLabel(record.jobType)}
      </h1>
      <p className="t-secondary mt-2">
        Editing from v{record.version}, verified {longDate(record.verifiedAt)} by {record.verifiedBy}.
        Publishing creates v{record.version + 1} and leaves this version readable for every job
        pinned to it.
      </p>
      {record.supersededBy && (
        <p className="t-secondary mt-2" style={{ color: "var(--color-signal-red)" }}>
          This version has already been superseded. Open the current record instead.
        </p>
      )}

      <RecordEditor
        recordId={record.id}
        changeId={changeId ?? null}
        defaults={{
          permitsRequired: record.permitsRequired.join(", "),
          reviewTimeline: record.reviewTimeline,
          quirks: record.quirks ?? "",
          fees: record.fees
            .map((fee) =>
              [fee.label, (fee.amountCents / 100).toFixed(2), fee.notes].filter(Boolean).join(" | "),
            )
            .join("\n"),
          submittals: record.submittalRequirements
            .map((s) => `${s.title} | ${s.detail} | ${s.required ? "required" : "conditional"}`)
            .join("\n"),
          inspectionSequence: record.inspectionSequence.join(", "),
          inspectionContact: record.inspectionContact ?? "",
          inspectionLeadTimeDays:
            record.inspectionLeadTimeDays === null ? "" : String(record.inspectionLeadTimeDays),
          reinspectionFeeDollars:
            record.reinspectionFeeCents === null
              ? ""
              : (record.reinspectionFeeCents / 100).toFixed(2),
          summary: prefillSummary,
        }}
      />
    </main>
  );
}
