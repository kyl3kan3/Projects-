"use server";

/**
 * Capture actions. Shorthand goes through a server action (it is a form); audio
 * goes through `/api/sessions` because the browser has to deliver bytes.
 *
 * Both call the same `captureSession`, so the consent gate, the meter and the
 * plan check cannot be reached around by choosing a different door.
 */

import { redirect } from "next/navigation";
import { after } from "next/server";
import { requirePractice } from "@/lib/auth";
import { captureSession, CaptureError } from "@/lib/sessions";
import { runPipelineTick } from "@/lib/pipeline";
import { requestMeta } from "@/lib/request";
import type { CaptureKind } from "@/db/schema";

export interface CaptureState {
  error?: string;
}

export async function captureShorthandAction(
  _prev: CaptureState,
  form: FormData,
): Promise<CaptureState> {
  const { practice, user } = await requirePractice();
  const meta = await requestMeta();

  const clientId = String(form.get("clientId") ?? "");
  const shorthandText = String(form.get("shorthandText") ?? "");
  const templateId = String(form.get("templateId") ?? "") || null;
  const durationRaw = String(form.get("durationMinutes") ?? "");
  const duration = durationRaw ? Number(durationRaw) : null;

  if (!clientId) return { error: "Choose a client first" };

  let noteId: string;
  try {
    const result = await captureSession(
      { practice, user },
      {
        clientId,
        captureKind: "shorthand" as CaptureKind,
        shorthandText,
        templateId,
        durationMinutes: Number.isFinite(duration) && duration ? duration : null,
      },
      meta,
    );
    noteId = result.noteId;
    // Drafting from shorthand is quick, but the clinician should not wait on the
    // response for it. `after()` runs the tick once the response is on the wire.
    after(async () => {
      try {
        await runPipelineTick({
          sessionIds: [result.sessionId],
          budgetMs: 25_000,
          skipPurge: true,
        });
      } catch (err) {
        console.error("[capture] inline tick failed", err);
      }
    });
  } catch (err) {
    if (err instanceof CaptureError) return { error: err.message };
    console.error("[capture] shorthand failed", err);
    return { error: "Could not capture that session. Try again." };
  }

  redirect(`/notes/${noteId}`);
}
