"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { isRedirectError, safeMessage } from "@/lib/errors";
import { applySpendMapping, setSpendCategory } from "@/lib/spend-import";

export interface MappingState {
  error?: string;
}

export async function confirmMapping(_prev: MappingState, form: FormData): Promise<MappingState> {
  try {
    const { user, org } = await requireOnboarded();
    const documentId = String(form.get("documentId") ?? "");
    await applySpendMapping({
      documentId,
      organizationId: org.id,
      userId: user.id,
      userLabel: user.name,
      mapping: {
        description: String(form.get("description") ?? ""),
        amount: String(form.get("amount") ?? ""),
        glAccount: String(form.get("glAccount") ?? ""),
        date: String(form.get("date") ?? ""),
      },
    });
    revalidatePath("/spend");
    revalidatePath("/footprint");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not import that file with those columns.") };
  }
  redirect("/spend");
}

export interface ClassifyState {
  error?: string;
  applied?: number;
}

export async function classifyLines(_prev: ClassifyState, form: FormData): Promise<ClassifyState> {
  try {
    const { user, org, period } = await requireOnboarded();
    const lineIds = form.getAll("lineId").map(String).filter(Boolean);
    const raw = String(form.get("category") ?? "");
    const excluded = raw === "__exclude__";
    const applied = await setSpendCategory({
      organizationId: org.id,
      periodId: period.id,
      userId: user.id,
      userLabel: user.name,
      lineIds,
      category: excluded ? null : raw || null,
      excluded,
      exclusionReason: excluded ? "Excluded by you on the review table" : undefined,
    });
    revalidatePath("/spend");
    revalidatePath("/footprint");
    return { applied };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not apply that category.") };
  }
}
