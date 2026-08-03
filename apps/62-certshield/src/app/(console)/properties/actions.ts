"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { accessLevel } from "@/lib/plans";
import { createProperty } from "@/lib/vendors";

export interface PropertyState {
  error: string | null;
  ok: string | null;
}

export async function createPropertyAction(
  _prev: PropertyState,
  formData: FormData,
): Promise<PropertyState> {
  const { user, org } = await requireUser();
  try {
    if (accessLevel(org) === "read_only") {
      throw new Error("Your trial has ended, so the file is read-only. Choose a plan to add more.");
    }
    const name = String(formData.get("name") ?? "").trim();
    const kind = String(formData.get("kind") ?? "property") === "project" ? "project" : "property";
    const address = String(formData.get("address") ?? "").trim() || null;
    const property = await createProperty(org, `${user.name} <${user.email}>`, {
      name,
      kind,
      address,
    });
    revalidatePath("/properties");
    revalidatePath("/dashboard");
    return { error: null, ok: `${property.name} added.` };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not add that property.",
      ok: null,
    };
  }
}
