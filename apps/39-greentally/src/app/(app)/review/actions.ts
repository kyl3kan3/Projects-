"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { acceptDocument, rejectDocument, type LineEdit } from "@/lib/documents";
import { isRedirectError, safeMessage } from "@/lib/errors";
import type { ActivityCategory } from "@/db/schema";

export interface ReviewState {
  error?: string;
}

const CATEGORIES = new Set<ActivityCategory>([
  "electricity_kwh",
  "natural_gas_kwh",
  "diesel_l",
  "petrol_l",
  "heating_oil_l",
  "propane_l",
]);

export async function acceptAction(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  try {
    const { user, org } = await requireOnboarded();
    const documentId = String(form.get("documentId") ?? "");
    const siteId = String(form.get("siteId") ?? "");
    const ids = form.getAll("lineId").map(String);

    const edits: LineEdit[] = ids.map((id) => {
      const raw = String(form.get(`category_${id}`) ?? "electricity_kwh") as ActivityCategory;
      return {
        activityLineId: id,
        category: CATEGORIES.has(raw) ? raw : "electricity_kwh",
        quantity: String(form.get(`quantity_${id}`) ?? ""),
        unit: String(form.get(`unit_${id}`) ?? ""),
        serviceStart: String(form.get(`start_${id}`) ?? ""),
        serviceEnd: String(form.get(`end_${id}`) ?? ""),
        provider: String(form.get(`provider_${id}`) ?? "").trim(),
      };
    });

    await acceptDocument({
      documentId,
      organizationId: org.id,
      siteId,
      userId: user.id,
      userLabel: user.name,
      edits,
    });

    revalidatePath("/documents");
    revalidatePath("/footprint");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not accept that. Check the fields.") };
  }
  redirect("/documents");
}

export async function rejectAction(documentId: string, reason: string): Promise<void> {
  const { user, org } = await requireOnboarded();
  await rejectDocument(documentId, org.id, user.id, user.name, reason);
  revalidatePath("/documents");
  revalidatePath("/footprint");
  redirect("/documents");
}
