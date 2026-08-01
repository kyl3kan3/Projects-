"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth";
import type { Actor } from "@/lib/audit";
import {
  documentById,
  setDocumentVisibility,
  uploadDocument,
} from "@/lib/documents";
import { featureAllowed, planForFeature } from "@/lib/plans";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import type { DocumentCategory } from "@/db/schema";

export interface DocumentState {
  error?: string;
  ok?: string;
}

function actorFor(user: { id: string; name: string }): Actor {
  return { kind: "user", id: user.id, name: user.name };
}

export async function uploadDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  try {
    const { association, user } = await requireCapability("documents");
    if (!featureAllowed(association.plan, "documentLibrary")) {
      return {
        error: `The document library comes with ${planForFeature("documentLibrary").name}. Upgrade in Settings and your uploads work immediately.`,
      };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload" };
    if (file.size > MAX_UPLOAD_BYTES) {
      return { error: `Files are limited to ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB` };
    }

    const category = String(formData.get("category") ?? "other") as DocumentCategory;
    if (!["bylaws", "ccrs", "minutes", "budget", "other"].includes(category)) {
      return { error: "Pick a category" };
    }

    const supersedesId = String(formData.get("supersedesId") ?? "");
    if (supersedesId && !(await documentById(association.id, supersedesId))) {
      return { error: "The document this replaces is not in this association's library" };
    }

    const row = await uploadDocument(
      {
        associationId: association.id,
        title: String(formData.get("title") ?? ""),
        category,
        versionLabel: String(formData.get("versionLabel") ?? "v1"),
        memberVisible: formData.get("memberVisible") === "on",
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        bytes: Buffer.from(await file.arrayBuffer()),
        supersedesId: supersedesId || null,
      },
      actorFor(user),
    );

    revalidatePath("/documents");
    return {
      ok: `Uploaded ${row.title} (${row.versionLabel})${
        supersedesId ? ", and the version it replaces is kept in the history" : ""
      }.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not upload that file" };
  }
}

export async function setVisibilityAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  try {
    const { association, user } = await requireCapability("documents");
    const documentId = String(formData.get("documentId") ?? "");
    const memberVisible = formData.get("memberVisible") === "on";
    await setDocumentVisibility(association.id, documentId, memberVisible, actorFor(user));
    revalidatePath("/documents");
    return {
      ok: memberVisible
        ? "Members can now see this in their portal."
        : "Hidden from members. The board can still see it.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not change that" };
  }
}
