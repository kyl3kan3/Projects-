"use server";

/**
 * Curation console actions.
 *
 * The write path is deliberately narrow: every publish goes through
 * `publishVersion`, which requires a reviewer id, and every approval fans out
 * afterwards. There is no "publish without review" endpoint here to find.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jurisdictionSources, requirementChanges } from "@/db/schema";
import { requireCurator } from "@/lib/auth";
import { fanOutChange } from "@/lib/alerts";
import { crawlSource, setSourceStatus } from "@/lib/change-detection";
import { acceptContribution, rejectContribution } from "@/lib/contributions";
import { safeMessage } from "@/lib/errors";
import { parseFeeLines, parseSubmittals } from "@/lib/curation-parse";
import { publishVersion, rejectChange, type RecordPatch } from "@/lib/requirements";

export interface CurationState {
  error: string | null;
  ok: string | null;
}

const CLEAN: CurationState = { error: null, ok: null };

function curatorName(name: string | null, email: string): string {
  return `${name ?? email.split("@")[0]}, curator`;
}

/* ------------------------------------------------------------------ *
 * Records
 * ------------------------------------------------------------------ */

/**
 * Publish an edited record as a new version. When a queued crawl diff prompted the
 * edit, its id comes along: the change row is marked approved by this curator and
 * the fan-out queues one alert per watching org.
 */
export async function publishRecordAction(
  _prev: CurationState,
  formData: FormData,
): Promise<CurationState> {
  const { user } = await requireCurator();
  const previousRecordId = String(formData.get("recordId") ?? "");
  const changeId = String(formData.get("changeId") ?? "") || null;
  const summary = String(formData.get("summary") ?? "").trim();
  if (summary.length < 8) {
    return { error: "Summarise the change — this line is what every watching org reads.", ok: null };
  }

  const { fees, error: feeError } = parseFeeLines(String(formData.get("fees") ?? ""));
  if (feeError) return { error: feeError, ok: null };
  const { submittals, error: submittalError } = parseSubmittals(
    String(formData.get("submittals") ?? ""),
  );
  if (submittalError) return { error: submittalError, ok: null };

  const leadTimeRaw = String(formData.get("inspectionLeadTimeDays") ?? "").trim();
  const reinspectionRaw = String(formData.get("reinspectionFeeDollars") ?? "").trim();

  const patch: RecordPatch = {
    permitsRequired: String(formData.get("permitsRequired") ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
    reviewTimeline: String(formData.get("reviewTimeline") ?? "").trim(),
    quirks: String(formData.get("quirks") ?? "").trim() || null,
    fees,
    submittalRequirements: submittals,
    inspectionSequence: String(formData.get("inspectionSequence") ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
    inspectionContact: String(formData.get("inspectionContact") ?? "").trim() || null,
    inspectionLeadTimeDays: leadTimeRaw ? Number(leadTimeRaw) : null,
    reinspectionFeeCents: reinspectionRaw ? Math.round(Number(reinspectionRaw) * 100) : null,
  };

  if (!patch.reviewTimeline) return { error: "State the review timeline.", ok: null };

  try {
    const published = await publishVersion({
      previousRecordId,
      patch,
      reviewerUserId: user.id,
      reviewerName: curatorName(user.name, user.email),
      sourceKind: String(formData.get("sourceKind") ?? "official_page") === "phone_confirmation"
        ? "phone_confirmation"
        : "official_page",
      origin: changeId ? "crawl_diff" : "curator",
      summary,
      changeId,
    });
    const fanOut = await fanOutChange(published.changeId);

    revalidatePath("/admin");
    revalidatePath("/admin/review");
    return {
      error: null,
      ok: `Published v${published.record.version}. ${fanOut.queued} ${fanOut.queued === 1 ? "org" : "orgs"} queued for alerts${fanOut.skippedByPlan > 0 ? `, ${fanOut.skippedByPlan} on Crew (in-app only)` : ""}.`,
    };
  } catch (err) {
    return { error: safeMessage(err, "That version could not be published."), ok: null };
  }
}

export async function rejectChangeAction(
  _prev: CurationState,
  formData: FormData,
): Promise<CurationState> {
  const { user } = await requireCurator();
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 4) return { error: "Say why it is noise.", ok: null };
  try {
    await rejectChange(String(formData.get("changeId") ?? ""), user.id, reason);
  } catch (err) {
    return { error: safeMessage(err, "That diff could not be rejected."), ok: null };
  }
  revalidatePath("/admin/review");
  revalidatePath("/admin");
  return { ...CLEAN, ok: "Marked as noise" };
}

/** Attach a queued diff to the job type it affects, before editing the record. */
export async function assignChangeJobTypeAction(formData: FormData): Promise<void> {
  await requireCurator();
  const changeId = String(formData.get("changeId") ?? "");
  const jobType = String(formData.get("jobType") ?? "");
  const db = getDb();
  await db
    .update(requirementChanges)
    .set({ jobType })
    .where(and(eq(requirementChanges.id, changeId), eq(requirementChanges.reviewState, "pending")));
  revalidatePath("/admin/review");
}

/* ------------------------------------------------------------------ *
 * Sources
 * ------------------------------------------------------------------ */

export async function setSourceStatusAction(formData: FormData): Promise<void> {
  await requireCurator();
  const status = String(formData.get("status") ?? "active");
  await setSourceStatus(
    String(formData.get("sourceId") ?? ""),
    status === "paused" ? "paused" : status === "broken" ? "broken" : "active",
  );
  revalidatePath("/admin/sources");
}

/** Crawl one source now, so a curator can confirm a fix without waiting 72 hours. */
export async function crawlNowAction(
  _prev: CurationState,
  formData: FormData,
): Promise<CurationState> {
  await requireCurator();
  const sourceId = String(formData.get("sourceId") ?? "");
  const db = getDb();
  const [source] = await db
    .select()
    .from(jurisdictionSources)
    .where(eq(jurisdictionSources.id, sourceId));
  if (!source) return { error: "That source could not be found.", ok: null };

  const result = await crawlSource(source);
  revalidatePath("/admin/sources");
  revalidatePath("/admin/review");
  if (result.outcome === "failed") {
    return { error: `Crawl failed: ${result.error ?? "unknown error"}`, ok: null };
  }
  return {
    error: null,
    ok:
      result.outcome === "changed"
        ? "Changed — a diff is waiting in the review queue"
        : result.outcome === "first_snapshot"
          ? "First snapshot stored; the next crawl can diff against it"
          : "No change in the content region",
  };
}

/* ------------------------------------------------------------------ *
 * Contributions
 * ------------------------------------------------------------------ */

export async function acceptContributionAction(
  _prev: CurationState,
  formData: FormData,
): Promise<CurationState> {
  const { user } = await requireCurator();
  try {
    const result = await acceptContribution({
      contributionId: String(formData.get("contributionId") ?? ""),
      reviewerUserId: user.id,
      reviewerName: curatorName(user.name, user.email),
    });
    const fanOut = await fanOutChange(result.changeId);
    revalidatePath("/admin/contributions");
    revalidatePath("/admin");
    return {
      error: null,
      ok: `Accepted, $10 credited, and ${fanOut.queued} ${fanOut.queued === 1 ? "org" : "orgs"} queued for alerts.`,
    };
  } catch (err) {
    return { error: safeMessage(err, "That contribution could not be accepted."), ok: null };
  }
}

export async function rejectContributionAction(
  _prev: CurationState,
  formData: FormData,
): Promise<CurationState> {
  const { user } = await requireCurator();
  try {
    await rejectContribution({
      contributionId: String(formData.get("contributionId") ?? ""),
      reviewerUserId: user.id,
      reason: String(formData.get("reason") ?? ""),
      badFaith: String(formData.get("badFaith") ?? "") === "on",
    });
  } catch (err) {
    return { error: safeMessage(err, "That contribution could not be rejected."), ok: null };
  }
  revalidatePath("/admin/contributions");
  revalidatePath("/admin");
  return { ...CLEAN, ok: "Rejected, with the reason recorded" };
}
