"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, sites, type DocumentKind } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { ingestDocument } from "@/lib/documents";
import { isRedirectError, safeMessage, ValidationError } from "@/lib/errors";
import { canUploadDocument } from "@/lib/plans";

export interface UploadState {
  error?: string;
  notice?: string;
  uploaded?: number;
}

const KINDS = new Set<DocumentKind>([
  "electricity_bill",
  "gas_bill",
  "fuel_receipt",
  "spend_csv",
  "other",
]);

/**
 * Batch upload.
 *
 * The whole file goes through the server action rather than a presigned browser PUT.
 * ARCHITECTURE.md specified presigned R2 uploads and the storage layer still supports
 * them; routing bytes through the action is what makes the product work with no cloud
 * account configured, and a utility bill is well under the body limit. On a deployment
 * with R2 the same call streams straight into the bucket.
 */
export async function uploadDocuments(
  _prev: UploadState,
  form: FormData,
): Promise<UploadState> {
  try {
    const { user, org, period } = await requireOnboarded();
    if (period.lockedAt) {
      throw new ValidationError(
        `Reporting year ${period.year} is locked. Unlock it to add documents, or start the next year.`,
      );
    }

    const kindRaw = String(form.get("kind") ?? "electricity_bill") as DocumentKind;
    const kind = KINDS.has(kindRaw) ? kindRaw : "other";
    const siteIdRaw = String(form.get("siteId") ?? "");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) throw new ValidationError("Choose at least one file.");

    const db = getDb();
    let siteId: string | null = null;
    if (siteIdRaw) {
      const [site] = await db.select().from(sites).where(eq(sites.id, siteIdRaw));
      if (!site || site.organizationId !== org.id) throw new ValidationError("Unknown site.");
      siteId = site.id;
    } else {
      const orgSites = await db.select().from(sites).where(eq(sites.organizationId, org.id));
      siteId = orgSites[0]?.id ?? null;
    }

    const already = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.periodId, period.id));

    const notices: string[] = [];
    let uploaded = 0;
    let firstSpendCsv: string | null = null;

    for (const file of files) {
      const gate = canUploadDocument(org.plan, already.length + uploaded);
      if (!gate.allowed) {
        notices.push(gate.reason);
        break;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isCsv =
        kind === "spend_csv" || /\.csv$/i.test(file.name) || file.type === "text/csv";
      const result = await ingestDocument({
        organizationId: org.id,
        periodId: period.id,
        siteId: isCsv ? null : siteId,
        filename: file.name,
        mimeType: isCsv ? "text/csv" : file.type || "application/octet-stream",
        bytes,
        kind: isCsv ? "spend_csv" : kind,
        actor: user.id,
        actorLabel: user.name,
      });
      if (result.duplicateOf) {
        notices.push(`${file.name} is byte-identical to ${result.duplicateOf}, so it was not added again.`);
      } else {
        uploaded += 1;
        if (isCsv && !firstSpendCsv) firstSpendCsv = result.documentId;
      }
    }

    revalidatePath("/documents");
    revalidatePath("/footprint");

    if (firstSpendCsv) redirect(`/spend/${firstSpendCsv}/map`);
    return { uploaded, notice: notices.join(" ") || undefined };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "That upload did not go through. Try again.") };
  }
}

export async function retryExtraction(documentId: string): Promise<void> {
  const { org } = await requireOnboarded();
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc || doc.organizationId !== org.id) return;
  const { enqueue } = await import("@/lib/jobs");
  await db
    .update(documents)
    .set({ status: "uploaded", error: null, updatedAt: new Date() })
    .where(eq(documents.id, doc.id));
  await enqueue({
    organizationId: org.id,
    kind: "extract_document",
    payload: { documentId: doc.id },
  });
  revalidatePath("/documents");
}
