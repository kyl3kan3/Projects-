"use server";

/**
 * Two endpoints, both called from the waste rows: mark a finding done (the
 * resource is gone, the money is recovered) or dismiss it (we were wrong, or the
 * resource is deliberate). Nothing else is exported.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { wasteFindings } from "@/db/schema";
import { requireOrg } from "@/lib/auth";

export interface WasteState {
  error?: string;
}

async function setStatus(id: string, status: "done" | "dismissed"): Promise<WasteState> {
  if (!id) return { error: "Missing finding" };
  const { org } = await requireOrg();
  const db = getDb();
  const [updated] = await db
    .update(wasteFindings)
    .set({ status, closedAt: new Date() })
    .where(
      and(
        eq(wasteFindings.orgId, org.id),
        eq(wasteFindings.id, id),
        eq(wasteFindings.status, "open"),
      ),
    )
    .returning();
  if (!updated) return { error: "That finding has already been dealt with" };
  revalidatePath("/waste");
  return {};
}

export async function markDoneAction(_prev: WasteState, formData: FormData): Promise<WasteState> {
  return setStatus(String(formData.get("findingId") ?? ""), "done");
}

export async function dismissAction(_prev: WasteState, formData: FormData): Promise<WasteState> {
  return setStatus(String(formData.get("findingId") ?? ""), "dismissed");
}
