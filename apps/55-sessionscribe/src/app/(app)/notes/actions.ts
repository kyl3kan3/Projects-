"use server";

/**
 * Review-room actions: save a section, regenerate a section, open an amendment.
 *
 * Signing is deliberately **not** here — it is `/api/notes/[id]/sign`, so there is
 * exactly one route into `signNote`, and it is the one the sign gate calls.
 *
 * Every function below goes through `lib/notes`, which calls `assertUnsigned`
 * first. A signed note cannot be edited through any of them.
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requirePractice } from "@/lib/auth";
import { amendNote, SignedNoteError } from "@/lib/signing";
import { NoteEditError, regenerateSection, saveSection } from "@/lib/notes";
import { CaptureError, noteContext, retrySession } from "@/lib/sessions";
import { runPipelineTick } from "@/lib/pipeline";
import { billingFacts } from "@/lib/billing";
import { entitlement } from "@/lib/plans";
import { requestMeta } from "@/lib/request";

export interface SectionState {
  error?: string;
  savedKey?: string;
}

export async function saveSectionAction(
  noteId: string,
  sectionKey: string,
  text: string,
): Promise<SectionState> {
  const { practice, user } = await requirePractice();
  const meta = await requestMeta();
  try {
    await saveSection(practice.id, noteId, sectionKey, text, user.id, meta);
  } catch (err) {
    if (err instanceof NoteEditError || err instanceof SignedNoteError) {
      return { error: err.message };
    }
    console.error("[notes] save failed", err);
    return { error: "Could not save that section." };
  }
  revalidatePath(`/notes/${noteId}`);
  return { savedKey: sectionKey };
}

export async function regenerateSectionAction(
  noteId: string,
  sectionKey: string,
): Promise<SectionState> {
  const { practice, user } = await requirePractice();
  const meta = await requestMeta();
  try {
    await regenerateSection(practice.id, noteId, sectionKey, user.id, meta);
  } catch (err) {
    if (err instanceof NoteEditError || err instanceof SignedNoteError) {
      return { error: err.message };
    }
    console.error("[notes] regenerate failed", err);
    return { error: "Could not regenerate that section." };
  }
  revalidatePath(`/notes/${noteId}`);
  return { savedKey: sectionKey };
}

/**
 * Put a failed session back in the queue. The pipeline's failure states are
 * meant to explain themselves and offer a way forward — a row that says "failed"
 * with no action is a dead end, and the clinician still owes the chart a note.
 */
export async function retryPipelineAction(noteId: string): Promise<SectionState> {
  const { practice, user } = await requirePractice();
  const ctx = await noteContext(practice.id, noteId);
  if (!ctx) return { error: "That note no longer exists." };
  try {
    await retrySession(practice.id, ctx.session.id, user.id);
    after(async () => {
      try {
        await runPipelineTick({
          sessionIds: [ctx.session.id],
          budgetMs: 45_000,
          skipPurge: true,
        });
      } catch (err) {
        console.error("[notes] retry tick failed", err);
      }
    });
  } catch (err) {
    if (err instanceof CaptureError) return { error: err.message };
    console.error("[notes] retry failed", err);
    return { error: "Could not retry that session." };
  }
  revalidatePath(`/notes/${noteId}`);
  return {};
}

export async function amendNoteAction(noteId: string): Promise<SectionState> {
  const { practice, user } = await requirePractice();
  const meta = await requestMeta();
  // Tenancy is checked here rather than inside amendNote: the note id comes from
  // the client, and "signed" is not the only thing worth verifying about it.
  const ctx = await noteContext(practice.id, noteId);
  if (!ctx) return { error: "That note no longer exists." };
  if (!entitlement(billingFacts(practice), new Date()).amendments) {
    return {
      error:
        "Amendments are a Caseload feature. Your signed note stays exactly as it is, and stays exportable.",
    };
  }
  try {
    await amendNote(noteId, user.id, meta);
  } catch (err) {
    if (err instanceof SignedNoteError) return { error: err.message };
    console.error("[notes] amend failed", err);
    return { error: "Could not open an amendment." };
  }
  revalidatePath(`/notes/${noteId}`);
  return {};
}
