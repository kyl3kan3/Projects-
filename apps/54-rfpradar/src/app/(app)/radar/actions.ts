"use server";

/**
 * Radar actions: the one-tap decisions on a match.
 *
 * Every exported function here is a public endpoint, so the list is exactly what
 * the radar's buttons call — nothing speculative, nothing left over. Each one
 * resolves the firm first (`requireWrite`, which also refuses in read-only
 * dunning) and scopes every query by `firm_id`.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireWrite } from "@/lib/auth";
// Marking a match seen happens in the notice reader itself, server-side. It is
// deliberately not exported as an action: every exported "use server" function
// is a public endpoint, and this one would have had no caller.
import { dismissMatch } from "@/lib/matching";
import { pursueMatch } from "@/lib/pursuits";
import { hasResponseWorkspace } from "@/lib/plans";
import { runPollAndScore } from "@/lib/jobs";
import { DISMISS_REASONS } from "@/lib/scoring";

function requiredField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) throw new Error(`Missing ${name}.`);
  return value;
}

/**
 * Pursue: creates the pursuit at go/no-go with the scorecard template and copies
 * the notice's dates into the calendar, then lands the user on the pursuit.
 *
 * On Scout the response workspace is not included, so this redirects to billing
 * with the reason rather than half-creating something the plan cannot show.
 */
export async function pursueMatchAction(formData: FormData): Promise<void> {
  const { firm, user, access } = await requireWrite();
  const matchId = requiredField(formData, "matchId");

  if (!hasResponseWorkspace(access.planId)) {
    redirect("/settings/billing?upgrade=workspace");
  }

  const result = await pursueMatch({ firmId: firm.id, actorUserId: user.id, matchId });
  revalidatePath("/radar");
  revalidatePath("/pursuits");
  revalidatePath("/deadlines");
  redirect(`/pursuits/${result.pursuit.id}`);
}

/** Watch: the same pursuit object, parked at the `watching` stage. */
export async function watchMatchAction(formData: FormData): Promise<void> {
  const { firm, user, access } = await requireWrite();
  const matchId = requiredField(formData, "matchId");

  if (!hasResponseWorkspace(access.planId)) {
    redirect("/settings/billing?upgrade=workspace");
  }

  await pursueMatch({ firmId: firm.id, actorUserId: user.id, matchId, stage: "watching" });
  revalidatePath("/radar");
  revalidatePath("/pursuits");
}

/**
 * Dismiss, with a reason. The reason is the point: counted per profile, it is
 * what turns "this feed is noisy" into "narrow the vehicle filter".
 */
export async function dismissMatchAction(formData: FormData): Promise<void> {
  const { firm, user } = await requireWrite();
  const matchId = requiredField(formData, "matchId");
  const reason = requiredField(formData, "reason");
  if (!(DISMISS_REASONS as readonly string[]).includes(reason)) {
    throw new Error("Pick one of the listed dismissal reasons.");
  }

  await dismissMatch(firm.id, matchId, reason);
  await audit({
    firmId: firm.id,
    actor: user.id,
    action: "match.dismissed",
    target: matchId,
    metadata: { reason },
  });
  revalidatePath("/radar");
  revalidatePath("/profiles");
}

/**
 * Pull-to-refresh, as a button: re-poll the sources whose interval has elapsed.
 * Bounded to 20 seconds so a slow portal cannot hang the request, and it is the
 * same job body the worker and the cron tick run.
 */
export async function refreshSourcesAction(): Promise<void> {
  await requireWrite();
  await runPollAndScore({ deadlineMs: Date.now() + 20_000 });
  revalidatePath("/radar");
}
