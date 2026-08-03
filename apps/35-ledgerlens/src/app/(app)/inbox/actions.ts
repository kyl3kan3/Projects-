"use server";

/**
 * Actions on one document. Five endpoints, each called from a control on screen.
 *
 * Every one of them re-resolves the session and scopes the query by
 * `organization_id`: a `"use server"` export is a public endpoint, and the document id
 * in the payload is attacker-controlled.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isRedirectError, safeMessage } from "@/lib/errors";
import {
  confirmDocument,
  dismissDuplicate,
  mergeDuplicate,
  rejectDocument,
  type Corrections,
} from "@/lib/review";
import { extractDocument } from "@/lib/extract-run";

export interface DocumentFormState {
  error: string | null;
}

function optional(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  return raw === null ? undefined : String(raw);
}

export async function confirmEntryAction(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const { user, org } = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "inbox");

  // Only fields the sheet actually rendered as editable are read, so an untouched
  // field is never rewritten with a stale value from a cached form.
  const corrections: Corrections = {};
  for (const field of ["vendor", "date", "total", "tax"] as const) {
    const value = optional(formData, field);
    if (value !== undefined) corrections[field] = value;
  }
  const category = optional(formData, "categorySlug");
  if (category !== undefined && category !== "") corrections.categorySlug = category;

  let period: string | null = null;
  try {
    const result = await confirmDocument(org.id, user.id, documentId, corrections);
    period = result.period;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "That entry could not be confirmed.") };
  }
  revalidatePath("/inbox");
  revalidatePath("/close");
  if (returnTo === "review") redirect(`/review?settled=${documentId}`);
  // The period matters: an entry dated last month is filed to last month, and sending the
  // operator to *this* month's inbox showed them a screen the row they just ruled off was
  // not on — so the settle rule never played and the work looked lost.
  redirect(`/inbox?settled=${documentId}${period ? `&period=${period}` : ""}`);
}

export async function rejectEntryAction(formData: FormData): Promise<void> {
  const { user, org } = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  await rejectDocument(org.id, user.id, documentId);
  revalidatePath("/inbox");
  redirect(`/inbox/${documentId}`);
}

export async function mergeDuplicateAction(formData: FormData): Promise<void> {
  const { user, org } = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  await mergeDuplicate(org.id, user.id, documentId);
  revalidatePath("/inbox");
  redirect(`/inbox/${documentId}`);
}

export async function dismissDuplicateAction(formData: FormData): Promise<void> {
  const { user, org } = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  await dismissDuplicate(org.id, user.id, documentId);
  revalidatePath("/inbox");
  redirect(`/inbox/${documentId}`);
}

export async function rerunExtractionAction(formData: FormData): Promise<void> {
  const { org } = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  // Scoped before the re-run: `extractDocument` takes an id, and an id from a form is
  // whatever the caller typed.
  const { getDb } = await import("@/db");
  const { documents } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const [owned] = await getDb()
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, org.id)));
  if (owned) await extractDocument(documentId, { force: true });
  revalidatePath("/inbox");
  redirect(`/inbox/${documentId}`);
}
