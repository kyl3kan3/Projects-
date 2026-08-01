"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { firms, sequences, type SequenceStep, type TonePreset } from "@/db/schema";
import { requireFirm } from "@/lib/auth";
import { activeSequence, saveLadder } from "@/lib/sequences";
import { MAX_RUNGS, normalizeLadder } from "@/lib/ladder";
import { validateTemplate } from "@/lib/tone";
import { audit } from "@/lib/audit";

export interface SequenceState {
  error?: string;
  notice?: string;
  fieldErrors?: string[];
}

function revalidate() {
  revalidatePath("/sequences");
  revalidatePath("/aging");
  revalidatePath("/approvals");
}

/** Save the ladder's pinned offsets. Normalisation keeps every rung reachable. */
export async function saveLadderAction(
  _prev: SequenceState,
  formData: FormData,
): Promise<SequenceState> {
  const { firm, user } = await requireFirm();
  const sequence = await activeSequence(firm.id);
  const existing = normalizeLadder(sequence.steps);

  const steps: SequenceStep[] = [];
  for (let i = 0; i < MAX_RUNGS; i++) {
    const raw = formData.get(`offset-${i}`);
    if (raw === null || String(raw).trim() === "") continue;
    const offset = Number(raw);
    if (!Number.isFinite(offset)) {
      return { error: `Step ${i + 1} needs a whole number of days.` };
    }
    if (offset < -60 || offset > 365) {
      return { error: `Step ${i + 1} must sit between 60 days before and a year after the due date.` };
    }
    steps.push({
      offsetDaysFromDue: Math.round(offset),
      escalationLevel: existing[i]?.escalationLevel ?? (Math.min(i + 1, 4) as 1 | 2 | 3 | 4),
      subject: existing[i]?.subject,
      body: existing[i]?.body,
    });
  }
  if (steps.length === 0) return { error: "A ladder needs at least one step." };

  const saved = await saveLadder(firm.id, steps, user.id);
  revalidate();
  const offsets = normalizeLadder(saved.steps).map((s) => s.offsetDaysFromDue);
  return {
    notice: `Saved. Steps now fire ${offsets
      .map((o) => (o < 0 ? `${Math.abs(o)}d before due` : `${o}d after due`))
      .join(", ")}.`,
  };
}

export async function saveToneAction(
  _prev: SequenceState,
  formData: FormData,
): Promise<SequenceState> {
  const { firm, user } = await requireFirm();
  const tone = String(formData.get("tone") ?? "") as TonePreset;
  if (!["warm", "neutral", "firm"].includes(tone)) return { error: "Pick a tone." };
  const db = getDb();
  const sequence = await activeSequence(firm.id);
  await db.update(sequences).set({ tone }).where(eq(sequences.id, sequence.id));
  await db.update(firms).set({ tone, updatedAt: new Date() }).where(eq(firms.id, firm.id));
  await audit(firm.id, user.id, "settings_updated", `tone → ${tone}`);
  revalidate();
  return { notice: `Tone set to ${tone}. Every unedited step now reads in that voice.` };
}

/** Override one step's copy. Refuses a template that would reach a client broken. */
export async function saveStepCopyAction(
  _prev: SequenceState,
  formData: FormData,
): Promise<SequenceState> {
  const { firm, user } = await requireFirm();
  const index = Number(formData.get("stepIndex") ?? -1);
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const reset = formData.get("reset") === "1";

  const db = getDb();
  const sequence = await activeSequence(firm.id);
  const steps = normalizeLadder(sequence.steps);
  if (!Number.isInteger(index) || index < 0 || index >= steps.length) {
    return { error: "That step no longer exists." };
  }

  if (reset) {
    steps[index] = { ...steps[index], subject: undefined, body: undefined };
    await db.update(sequences).set({ steps }).where(eq(sequences.id, sequence.id));
    await audit(firm.id, user.id, "ladder_updated", `step ${index + 1} copy reset`);
    revalidate();
    return { notice: `Step ${index + 1} is back to the ${sequence.tone} preset.` };
  }

  const problems = validateTemplate(subject, body);
  if (problems.length) {
    return {
      error: "That template would not send correctly.",
      fieldErrors: problems.map((p) => `${p.field}: ${p.message}`),
    };
  }

  steps[index] = { ...steps[index], subject, body };
  await db.update(sequences).set({ steps }).where(eq(sequences.id, sequence.id));
  await audit(firm.id, user.id, "ladder_updated", `step ${index + 1} copy edited`);
  revalidate();
  return { notice: `Step ${index + 1} saved in your own words.` };
}
