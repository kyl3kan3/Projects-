import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLines, documents, sites } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { signedDocumentUrl } from "@/lib/storage";
import { validateLine } from "@/lib/validators";
import { unitOptions } from "@/lib/units";
import { ReviewPanel, type ReviewLine } from "./ReviewPanel";

export const metadata: Metadata = { title: "Review" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const { org, period } = await requireOnboarded();
  const db = getDb();

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, org.id)));
  if (!doc) notFound();

  const siteRows = await db.select().from(sites).where(eq(sites.organizationId, org.id));
  const lines = await db
    .select()
    .from(activityLines)
    .where(eq(activityLines.documentId, doc.id))
    .orderBy(activityLines.serviceStart);

  // Re-run the validators for display, so the screen states the reason it is here
  // rather than relying on a message stored at extraction time.
  const site = siteRows.find((s) => s.id === doc.siteId) ?? siteRows[0];
  const others = await db
    .select({
      documentId: activityLines.documentId,
      siteId: activityLines.siteId,
      category: activityLines.category,
      serviceStart: activityLines.serviceStart,
      serviceEnd: activityLines.serviceEnd,
      provider: activityLines.provider,
    })
    .from(activityLines)
    .innerJoin(documents, eq(activityLines.documentId, documents.id))
    .where(
      and(
        eq(activityLines.periodId, doc.periodId),
        ne(activityLines.documentId, doc.id),
        inArray(documents.status, ["accepted", "needs_review"]),
      ),
    );

  const blockers = site
    ? lines
        .flatMap((l) =>
          validateLine(
            {
              category: l.category,
              quantityMilli: l.quantityMilli,
              serviceStart: l.serviceStart,
              serviceEnd: l.serviceEnd,
              provider: l.provider,
            },
            {
              siteId: site.id,
              year: period.year,
              floorAreaSqm: site.floorAreaSqm,
              documentId: doc.id,
              existing: others,
            },
          ),
        )
        .map((i) => i.detail)
    : [];

  const reviewLines: ReviewLine[] = lines.map((l) => ({
    id: l.id,
    category: l.category,
    // Show the quantity in the unit the bill printed, so the operator is checking the
    // bill against itself rather than against a conversion.
    quantity: l.sourceQuantity || String(l.quantityMilli / 1000),
    unit: l.sourceUnit || l.unit,
    unitOptions: unitOptions(l.category),
    serviceStart: l.serviceStart,
    serviceEnd: l.serviceEnd,
    provider: l.provider,
    confidences: l.fieldConfidences,
    evidence: l.evidence,
    reviewed: Boolean(l.reviewedBy),
  }));

  return (
    <ReviewPanel
      documentId={doc.id}
      filename={doc.filename}
      mimeType={doc.mimeType}
      fileUrl={signedDocumentUrl(doc.id)}
      status={doc.status}
      error={doc.error}
      extractor={doc.extractor}
      siteId={site?.id ?? ""}
      sites={siteRows.map((s) => ({ id: s.id, name: s.name }))}
      lines={reviewLines}
      blockers={[...new Set(blockers)]}
    />
  );
}
