"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { accessLevel } from "@/lib/plans";
import { confirmReview, type ReviewLineInput } from "@/lib/certificates";
import { parseLimitToCents } from "@/lib/format";
import type { CoverageKind } from "@/db/schema";

export interface ReviewState {
  error: string | null;
}

interface SubmittedLine {
  id: string | null;
  kind: CoverageKind;
  label: string;
  min: string;
  policyNumber: string;
  effectiveOn: string;
  expiresOn: string;
  additionalInsured: "yes" | "no" | "unknown";
  waiverOfSubrogation: "yes" | "no" | "unknown";
}

const TRISTATE = (value: SubmittedLine["additionalInsured"]): boolean | null =>
  value === "yes" ? true : value === "no" ? false : null;

/**
 * Confirm a reviewed certificate. This is the human gate: the only path that lets a
 * `needs_review` or `failed` certificate into compliance, and it stamps who did it.
 */
export async function confirmReviewAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const { user, org } = await requireUser();
  const certificateId = String(formData.get("certificateId") ?? "");
  try {
    if (accessLevel(org) === "read_only") {
      throw new Error(
        "Your trial has ended, so reviews are paused. Certificates already on file are intact and binder exports still work.",
      );
    }

    const raw = String(formData.get("lines") ?? "[]");
    let submitted: SubmittedLine[];
    try {
      submitted = JSON.parse(raw) as SubmittedLine[];
    } catch {
      throw new Error("The review form sent something unreadable. Reload the page and try again.");
    }

    const lines: ReviewLineInput[] = submitted.map((line) => ({
      id: line.id || null,
      kind: line.kind,
      label: line.label.trim(),
      limitCents: line.min.trim() ? parseLimitToCents(line.min) : null,
      policyNumber: line.policyNumber.trim() || null,
      effectiveOn: line.effectiveOn.trim() || null,
      expiresOn: line.expiresOn.trim() || null,
      additionalInsured: TRISTATE(line.additionalInsured),
      waiverOfSubrogation: TRISTATE(line.waiverOfSubrogation),
    }));

    for (const line of lines) {
      if (line.limitCents == null && submitted.find((s) => s.label.trim() === line.label)?.min.trim()) {
        throw new Error(`The limit on the ${line.label} line is not an amount CertShield can read.`);
      }
    }

    const result = await confirmReview(org, user, {
      certificateId,
      carrier: String(formData.get("carrier") ?? "").trim() || null,
      producer: String(formData.get("producer") ?? "").trim() || null,
      holderName: String(formData.get("holderName") ?? "").trim() || null,
      holderOk: formData.get("holderOk") === "on",
      lines,
    });
    if (!result.ok) return { error: result.error };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not confirm that certificate." };
  }

  revalidatePath("/review");
  revalidatePath("/dashboard");
  revalidatePath("/vendors");
  redirect("/review?confirmed=1");
}
