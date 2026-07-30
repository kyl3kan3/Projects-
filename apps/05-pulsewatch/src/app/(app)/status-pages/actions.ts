"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  createStatusPage,
  deleteStatusPage,
  setPublished,
  setStatusPageMonitors,
  StatusPageError,
} from "@/lib/status-pages";

export interface StatusPageFormState {
  error?: string;
  createdSlug?: string;
}

export async function createStatusPageAction(
  _prev: StatusPageFormState,
  form: FormData,
): Promise<StatusPageFormState> {
  const { team } = await requireUser();
  try {
    const page = await createStatusPage({
      teamId: team.id,
      planId: team.plan,
      slug: String(form.get("slug") ?? ""),
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? "") || null,
      monitorIds: form.getAll("monitorIds").map(String),
    });
    revalidatePath("/status-pages");
    return { createdSlug: page.slug };
  } catch (err) {
    if (err instanceof StatusPageError) return { error: err.message };
    console.error("[status-pages] create failed", err);
    return { error: "Could not create that status page" };
  }
}

export async function setMonitorsAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  const id = String(formData.get("id"));
  await setStatusPageMonitors(id, team.id, formData.getAll("monitorIds").map(String));
  revalidatePath("/status-pages");
}

export async function togglePublishedAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  const id = String(formData.get("id"));
  await setPublished(id, team.id, formData.get("published") === "true");
  revalidatePath("/status-pages");
}

export async function deleteStatusPageAction(formData: FormData): Promise<void> {
  const { team } = await requireUser();
  await deleteStatusPage(String(formData.get("id")), team.id);
  revalidatePath("/status-pages");
}
