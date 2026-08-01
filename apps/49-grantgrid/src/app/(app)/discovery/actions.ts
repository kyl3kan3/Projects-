"use server";

/**
 * Discovery mutations: add a funder to the pipeline, and report a record that has
 * gone stale. Both re-resolve the session; a funder id from the client is checked
 * against the approved set before anything is written.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { funderChangeReports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDeadline, createGrant } from "@/lib/grants";
import { getFunder } from "@/lib/discovery";
import { effectivePlan } from "@/lib/billing";
import { hasDiscovery } from "@/lib/plans";
import { scoreFunder, type ScoringProfile } from "@/lib/fit-score";
import { isCivilDate } from "@/lib/dates";
import { parseDollarsToCents } from "@/lib/money";

export interface DiscoveryActionState {
  error: string | null;
  ok?: boolean;
}

function str(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export async function addFunderToPipelineAction(
  _prev: DiscoveryActionState,
  form: FormData,
): Promise<DiscoveryActionState> {
  const { user, org } = await requireUser();
  if (!hasDiscovery(effectivePlan(org))) {
    return { error: "Discovery is part of Grow. Your pipeline keeps working on Seed." };
  }

  const funder = await getFunder(str(form, "funderId"));
  if (!funder) return { error: "That funder is no longer in the curated set" };

  const askRaw = str(form, "askAmount");
  const askAmountCents = askRaw
    ? parseDollarsToCents(askRaw)
    : (org.profile.typicalAskCents ?? null);
  if (askRaw && askAmountCents === null) {
    return { error: `"${askRaw}" is not an amount I can read. Try 25,000 or 25k.` };
  }

  // Snapshot the score at the moment of the decision, so the pipeline records what
  // was actually known when someone chose to spend their week on this.
  const profile: ScoringProfile = {
    mission: org.profile.mission,
    serviceStates: org.profile.serviceStates,
    causeCodes: org.profile.causeCodes,
    typicalAskCents: askAmountCents,
    budgetBand: org.profile.budgetBand,
  };
  const score = scoreFunder(profile, funder, {
    profileVersion: org.profileVersion,
    funderVersion: funder.version,
  });

  const actor = user.name?.trim() || user.email.split("@")[0];
  const result = await createGrant(org, {
    organizationId: org.id,
    title: str(form, "title") || `Request to ${funder.name}`,
    funderName: funder.name,
    funderId: funder.id,
    askAmountCents,
    ownerUserId: user.id,
    notes: funder.deadlinesNote ? `Funder note: ${funder.deadlinesNote}` : null,
    source: "discovery",
    fitScoreAtAdd: score?.total ?? null,
    actor,
  });
  if ("error" in result) return { error: result.error };

  const dueOn = str(form, "dueOn");
  if (dueOn && isCivilDate(dueOn)) {
    await addDeadline(org.id, result.grant.id, { kind: "application", dueOn }, actor);
  }

  revalidatePath("/pipeline");
  revalidatePath("/discovery");
  redirect(`/pipeline/${result.grant.id}`);
}

export async function reportFunderChangeAction(
  _prev: DiscoveryActionState,
  form: FormData,
): Promise<DiscoveryActionState> {
  const { org } = await requireUser();
  const funder = await getFunder(str(form, "funderId"));
  const note = str(form, "note");
  if (!funder) return { error: "That funder is no longer in the curated set" };
  if (!note) return { error: "Tell us what has changed" };

  const db = getDb();
  await db
    .insert(funderChangeReports)
    .values({ funderId: funder.id, organizationId: org.id, note });
  revalidatePath("/discovery");
  return { error: null, ok: true };
}
