"use server";

/**
 * The patient flow's two server actions. Both are reachable by anyone holding the
 * link — that is the whole authentication model — so both re-resolve the token
 * from scratch and trust nothing in the form except the answers.
 *
 * Progressive enhancement is why these redirect instead of returning state: the
 * packet must work on a phone whose JavaScript never arrives (DESIGN.md), and a
 * plain `<form action={...}>` post can only be answered with a redirect. Errors
 * come back as a short code in the query string and the page re-derives the real
 * message server-side.
 */

import { redirect } from "next/navigation";
import {
  captureSignature,
  completionState,
  loadAnswersForPatient,
  markStarted,
  resolveIntakeToken,
  saveSection,
  signaturesFor,
  completeIntake,
} from "@/lib/intakes";
import type { ResolvedIntake } from "@/lib/intakes";
import { sections } from "@/lib/blocks";
import { getPatientIdentity } from "@/lib/patients";
import { storeUpload, UploadError } from "@/lib/uploads";
import { clientIp, userAgent } from "@/lib/request";
import { sendEmail } from "@/lib/delivery";
import { clinicianNotificationEmail } from "@/lib/messages";
import { env } from "@/lib/env";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Which signature problem to name on the way back. */
type SigError = "disclosure" | "name" | "draw" | "typed" | "already" | "unknown";

function sigErrorFor(problems: string[]): SigError {
  const joined = problems.join(" ");
  if (/Tick the box/.test(joined)) return "disclosure";
  if (/already been signed/.test(joined)) return "already";
  if (/Draw your signature/.test(joined)) return "draw";
  if (/typed signature only/.test(joined)) return "typed";
  if (/full name|full legal name/.test(joined)) return "name";
  return "unknown";
}

export async function saveSectionAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const sectionIndex = Number.parseInt(String(formData.get("section") ?? "0"), 10) || 0;

  const resolvedResult = await resolveIntakeToken(token);
  if (!resolvedResult.ok) redirect(`/intake/${token}`);
  const resolved = resolvedResult.value;

  const ip = await clientIp();
  await markStarted(resolved.intake, ip);

  const all = sections(resolved.version.blocks);
  const section = all[sectionIndex];
  if (!section) redirect(`/intake/${token}?s=0`);

  /* ---- answers ---- */
  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && key.includes(".")) answers[key] = value;
  }
  const { problems } = await saveSection({ resolved, sectionIndex, answers, ip });

  /* ---- uploads ---- */
  for (const block of section.blocks) {
    if (block.kind !== "upload") continue;
    const file = formData.get(`${block.key}.file`);
    if (!(file instanceof File) || file.size === 0) continue;
    try {
      await storeUpload({
        practice: resolved.practice,
        intakeId: resolved.intake.id,
        blockKey: block.key,
        block,
        filename: file.name,
        contentType: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
        ip,
      });
    } catch (err) {
      if (err instanceof UploadError) {
        redirect(`/intake/${token}?s=${sectionIndex}&upload=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
  }

  if (problems.length) redirect(`/intake/${token}?s=${sectionIndex}&err=1`);

  /* ---- signature, when this section carries one ---- */
  const signatureBlock = section.blocks.find((b) => b.kind === "signature");
  if (signatureBlock) {
    const already = await signaturesFor(resolved.intake.id);
    if (!already.some((s) => s.blockKey === signatureBlock.key)) {
      const result = await captureSignature({
        resolved,
        blockKey: signatureBlock.key,
        signature: {
          kind: String(formData.get("signatureKind") ?? "typed") === "drawn" ? "drawn" : "typed",
          payload: String(formData.get("signaturePayload") ?? ""),
          signedName: String(formData.get("signedName") ?? ""),
          disclosureAccepted: formData.get("disclosureAccepted") === "on",
        },
        ip,
        userAgent: await userAgent(),
      });
      if (result.problems.length) {
        redirect(`/intake/${token}?s=${sectionIndex}&sig=${sigErrorFor(result.problems)}`);
      }
    }
  }

  /* ---- finish, or move on ---- */
  const next = sectionIndex + 1;
  if (next < all.length) redirect(`/intake/${token}?s=${next}`);

  // Re-read from the database: completion is recomputed from stored answers, never
  // inferred from the patient having reached the last screen.
  const fresh = await resolveIntakeToken(token);
  if (!fresh.ok) redirect(`/intake/${token}`);
  const answersNow = await loadAnswersForPatient(fresh.value, ip);
  const signed = await signaturesFor(fresh.value.intake.id);
  const state = completionState(
    fresh.value.version.blocks,
    answersNow,
    signed.map((s) => s.blockKey),
  );
  if (!state.complete) {
    const firstGap = state.missingSections[0] ?? 0;
    redirect(`/intake/${token}?s=${firstGap}&err=1`);
  }

  const { flagged } = await completeIntake(fresh.value, ip);
  await notifyClinician(fresh.value, flagged);
  redirect(`/intake/${token}?done=1`);
}

/**
 * Tell the clinician. The message is a first name and a link (lib/messages), and
 * the risk-flag variant says "review needed" without naming the instrument — a
 * subject line is read by whoever is looking at the phone on the desk.
 */
async function notifyClinician(resolved: ResolvedIntake, flagged: boolean): Promise<void> {
  const db = getDb();
  const staff = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.practiceId, resolved.intake.practiceId));
  const recipient =
    staff.find((s) => s.id === resolved.intake.assignedUserId) ??
    staff.find((s) => s.role === "owner") ??
    staff[0];
  if (!recipient) return;

  // The first name is the only patient field a message may carry, and reading it
  // is still a disclosure — so it goes through the audited helper, as the system.
  const identity = await getPatientIdentity(resolved.practice, resolved.intake.patientId, {
    type: "system",
    id: "notifier",
    label: "completion notifier",
  });

  await sendEmail(
    recipient.email,
    clinicianNotificationEmail({
      clinicianName: recipient.name,
      patientFirstName: identity?.firstName ?? "A patient",
      practiceName: resolved.practice.name,
      dashboardUrl: `${env.appUrl}/intakes`,
      riskFlag: flagged,
    }),
  );
}
