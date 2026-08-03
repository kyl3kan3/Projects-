"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { parties, tasks } from "@/db/schema";
import { uploadDocument } from "@/lib/documents";
import { partyIdForToken } from "@/lib/portal";

export interface PortalUploadState {
  error: string | null;
  ok: string | null;
}

/**
 * A party uploading their own document. Authorised by the token in the URL and
 * nothing else — the token is checked against the hash column on every call, so a
 * revoked link stops working immediately, mid-session.
 */
export async function portalUploadAction(
  _prev: PortalUploadState,
  form: FormData,
): Promise<PortalUploadState> {
  const token = String(form.get("token") ?? "");
  const resolved = await partyIdForToken(token);
  if (!resolved) {
    return { error: "This link is no longer active. Ask your coordinator for a new one.", ok: null };
  }

  const db = getDb();
  const [party] = await db
    .select({ name: parties.name, role: parties.role })
    .from(parties)
    .where(eq(parties.id, resolved.partyId));
  if (!party) return { error: "This link is no longer active.", ok: null };

  const taskId = String(form.get("taskId") ?? "");
  const [task] = await db
    .select({ id: tasks.id, label: tasks.label, ownerRole: tasks.ownerRole })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.dealId, resolved.dealId)));
  if (!task) return { error: "That item is not on this transaction.", ok: null };
  // A party can only put a document against something they own.
  if (task.ownerRole !== party.role) {
    return { error: "That item is not yours to send. Your coordinator handles it.", ok: null };
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first.", ok: null };
  }

  const result = await uploadDocument({
    dealId: resolved.dealId,
    taskId: task.id,
    label: task.label,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    bytes: Buffer.from(await file.arrayBuffer()),
    uploadedBy: `${party.name} (${party.role})`,
  });
  if (!result.ok) return { error: result.error, ok: null };

  revalidatePath(`/p/${token}`);
  return {
    error: null,
    ok: `Thank you — ${result.document.filename} is on the file. Your coordinator will confirm it.`,
  };
}
