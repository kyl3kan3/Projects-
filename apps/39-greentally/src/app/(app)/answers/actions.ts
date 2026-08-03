"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { questionnaireAnswers, type Framework } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isRedirectError, safeMessage, ValidationError } from "@/lib/errors";
import { canUseAnswerBank } from "@/lib/plans";
import { generateAnswers } from "@/lib/questionnaire";

export interface AnswersState {
  error?: string;
  notice?: string;
}

export async function generateAnswersAction(
  _prev: AnswersState,
  form: FormData,
): Promise<AnswersState> {
  try {
    const { org, period } = await requireOnboarded();
    const gate = canUseAnswerBank(org.plan);
    if (!gate.allowed) throw new ValidationError(gate.reason);

    const raw = String(form.get("framework") ?? "cdp_style");
    const framework: Exclude<Framework, "custom"> =
      raw === "ecovadis_style" ? "ecovadis_style" : "cdp_style";

    const result = await generateAnswers(period.id, framework);
    revalidatePath("/answers");
    return {
      notice:
        result.created + result.updated === 0
          ? "Every answer already matches the current figures."
          : `${result.created} written, ${result.updated} refreshed from the current figures.`,
    };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not generate the answers.") };
  }
}

export interface SaveAnswerState {
  error?: string;
  savedId?: string;
}

/**
 * Save an operator's tone note and readiness.
 *
 * `answerText` is never writable from here: the figures in an answer come from the
 * engine, and a form that could overwrite them would defeat the entire provenance claim.
 */
export async function saveAnswer(
  _prev: SaveAnswerState,
  form: FormData,
): Promise<SaveAnswerState> {
  try {
    const { user, org, period } = await requireOnboarded();
    const id = String(form.get("answerId") ?? "");
    const toneNote = String(form.get("toneNote") ?? "").slice(0, 2000);
    const ready = form.get("ready") === "on";

    const db = getDb();
    const [answer] = await db
      .select()
      .from(questionnaireAnswers)
      .where(
        and(
          eq(questionnaireAnswers.id, id),
          eq(questionnaireAnswers.organizationId, org.id),
          eq(questionnaireAnswers.periodId, period.id),
        ),
      );
    if (!answer) throw new ValidationError("That answer no longer exists.");

    await db
      .update(questionnaireAnswers)
      .set({ toneNote, status: ready ? "ready" : "draft", updatedAt: new Date() })
      .where(eq(questionnaireAnswers.id, answer.id));

    if (ready && answer.status !== "ready") {
      await audit({
        organizationId: org.id,
        actor: user.id,
        actorLabel: user.name,
        action: "answer.marked_ready",
        target: answer.questionText.slice(0, 80),
        metadata: { framework: answer.framework, questionKey: answer.questionKey },
      });
    }

    revalidatePath("/answers");
    return { savedId: answer.id };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not save that.") };
  }
}
