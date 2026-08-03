import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@/components/icons";
import { SuggestForm } from "./SuggestForm";
import { requireUser } from "@/lib/auth";
import { money, totalCents } from "@/lib/format";
import { getRecordById } from "@/lib/requirements";
import { jobTypeLabel } from "@/lib/taxonomy";
import { CONTRIBUTION_CREDIT_CENTS } from "@/lib/plans";

export const metadata: Metadata = { title: "Suggest an edit" };

export default async function SuggestPage({
  params,
}: {
  params: Promise<{ slug: string; recordId: string }>;
}) {
  const { slug, recordId } = await params;
  await requireUser();

  const context = await getRecordById(recordId);
  if (!context || context.jurisdiction.slug !== slug) notFound();

  const { record, jurisdiction } = context;
  const primaryFee = record.fees[0];

  return (
    <main className="screen pt-6">
      <Link href={`/jurisdictions/${slug}?type=${record.jobType}`} className="btn-quiet btn-quiet-sm">
        <IconArrowLeft size={18} />
        {jurisdiction.name}
      </Link>

      <h1 className="t-h2 mt-4">Suggest an edit</h1>
      <p className="t-secondary mt-2">
        {jurisdiction.name} · {jobTypeLabel(record.jobType)} · v{record.version}. Currently on record:{" "}
        {record.permitsRequired.join(" + ") || "no permit required"},{" "}
        <span className="t-mono">{money(totalCents(record.fees))}</span>, {record.reviewTimeline}.
      </p>
      <p className="t-secondary mt-2">
        Nothing you send publishes on its own — a curator checks it against the source or calls the
        department. Accepted edits earn {money(CONTRIBUTION_CREDIT_CENTS)} of account credit, capped
        at half an invoice.
      </p>

      <SuggestForm
        recordId={record.id}
        slug={slug}
        currentFeeLabel={primaryFee?.label ?? "Permit fee"}
        currentFeeDollars={primaryFee ? (primaryFee.amountCents / 100).toFixed(2) : "0.00"}
        currentTimeline={record.reviewTimeline}
      />
    </main>
  );
}
