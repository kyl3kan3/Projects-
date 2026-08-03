/**
 * src/server/campaigns.ts
 *
 * Segments, sequences, enrollment lifecycle, and the one path any outbound touch
 * takes. Everything here that could send a message goes through `sendStepTouch`,
 * and `sendStepTouch` calls `decideTouch` (lib/consent.ts) before it renders
 * anything. There is no second send path — that is the whole design.
 *
 * The bounded-sequence property matters as much as the consent gate: a campaign
 * has N steps at fixed offsets from enrollment, a per-patient touch cap, and a
 * unique `(campaign_id, patient_id)` enrollment. Together those make it
 * impossible for a patient to receive an unbounded stream of "come back!"
 * messages — the failure mode where an "overdue" flag stays true forever and a
 * daily sweep mails the same person until they die.
 */

import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  campaignSteps,
  campaigns,
  enrollments,
  locations,
  patients,
  practices,
  templates,
  touches,
  type Campaign,
  type CampaignStep,
  type Location,
  type Patient,
  type Template,
} from "@/db/schema";
import { addMonths, formatMonthYear, toDayStart } from "@/lib/dates";
import {
  decideTouch,
  enrollmentStatusForDenial,
  nextSendableAt,
  type TouchDenial,
} from "@/lib/consent";
import { finalizeEmail, finalizeSms, renderTemplate } from "@/lib/merge";
import { phoneDisplay } from "@/lib/format";
import { CHASE_BUCKETS, type OverdueBucket } from "@/lib/recall";
import { channelAllowed, sendingAllowed, sequenceLengthAllowed, type Plan } from "@/lib/plans";
import { bookingUrl, mintBookingToken, mintStopToken, stopUrl, tokenFingerprint } from "@/lib/tokens";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";
import { sendEmail, sendSms } from "@/server/notify";

export interface SegmentSpec {
  buckets: string[];
  requiresEmail?: boolean;
  requiresSms?: boolean;
  excludeEnrolled?: boolean;
}

export interface CampaignSummary {
  campaign: Campaign;
  steps: (CampaignStep & { templateName: string; subject: string | null })[];
  enrolled: number;
  active: number;
  stoppedBooked: number;
  touchesSent: number;
  segmentSize: number;
}

/* ------------------------------------------------------------------ segment */

/**
 * Bucket boundaries as due-date thresholds — see server/overdue.ts.
 *
 * Every comparison uses Drizzle's typed operators. A `Date` interpolated into a
 * raw `sql` fragment bypasses the column encoder and postgres.js then throws on
 * it at runtime, which no type-check or build will catch.
 */
function bucketConditions(buckets: OverdueBucket[], today: Date) {
  const t = toDayStart(today);
  const clauses = buckets.map((bucket) => {
    switch (bucket) {
      case "m3_6":
        return and(lte(patients.nextDueOn, addMonths(t, -3)), gt(patients.nextDueOn, addMonths(t, -6)));
      case "m6_12":
        return and(lte(patients.nextDueOn, addMonths(t, -6)), gt(patients.nextDueOn, addMonths(t, -12)));
      case "m12_24":
        return and(lte(patients.nextDueOn, addMonths(t, -12)), gt(patients.nextDueOn, addMonths(t, -24)));
      case "m24_plus":
        return lte(patients.nextDueOn, addMonths(t, -24));
      default:
        return sql`false`;
    }
  });
  return clauses.length === 1 ? clauses[0] : or(...clauses);
}

function normalizeBuckets(raw: string[]): OverdueBucket[] {
  const valid = raw.filter((b): b is OverdueBucket => (CHASE_BUCKETS as string[]).includes(b));
  return valid.length ? valid : ["m6_12"];
}

/**
 * The patients a segment currently matches. `excludeEnrolled` leaves out anyone
 * already enrolled in *this* campaign (the unique index would refuse them anyway)
 * and anyone mid-sequence in another running campaign — two practices' worth of
 * reactivation copy arriving the same week is how a roster learns to ignore both.
 */
export async function segmentPatients(input: {
  locationId: string;
  segment: SegmentSpec;
  campaignId?: string;
  today?: Date;
  limit?: number;
}): Promise<Patient[]> {
  const db = getDb();
  const today = input.today ?? new Date();
  const buckets = normalizeBuckets(input.segment.buckets);

  const conditions = [
    eq(patients.locationId, input.locationId),
    eq(patients.status, "active"),
    eq(patients.doNotContact, false),
  ];
  const bucketClause = bucketConditions(buckets, today);
  if (bucketClause) conditions.push(bucketClause);

  if (input.segment.requiresEmail) {
    conditions.push(
      and(
        eq(patients.emailConsent, true),
        isNull(patients.emailOptedOutAt),
        isNull(patients.emailBouncedAt),
        sql`${patients.email} is not null`,
      )!,
    );
  }
  if (input.segment.requiresSms) {
    conditions.push(
      and(
        eq(patients.smsConsent, true),
        isNull(patients.smsOptedOutAt),
        isNull(patients.phoneFailedAt),
        sql`${patients.phone} is not null`,
      )!,
    );
  }

  const rows = await db
    .select({ patient: patients })
    .from(patients)
    .where(and(...conditions))
    .orderBy(asc(patients.nextDueOn))
    .limit(input.limit ?? 5000);

  let candidates = rows.map((r) => r.patient);

  if (input.segment.excludeEnrolled !== false) {
    const busy = await db
      .select({ patientId: enrollments.patientId })
      .from(enrollments)
      .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
      .where(
        and(
          eq(campaigns.locationId, input.locationId),
          eq(enrollments.status, "active"),
        ),
      );
    const busyIds = new Set(busy.map((b) => b.patientId));
    candidates = candidates.filter((p) => !busyIds.has(p.id));
  }

  if (input.campaignId) {
    const already = await db
      .select({ patientId: enrollments.patientId })
      .from(enrollments)
      .where(eq(enrollments.campaignId, input.campaignId));
    const ids = new Set(already.map((a) => a.patientId));
    candidates = candidates.filter((p) => !ids.has(p.id));
  }

  return candidates;
}

/* ---------------------------------------------------------------- campaigns */

export async function createCampaign(input: {
  locationId: string;
  practiceId: string;
  actorId: string;
  plan: Plan;
  name: string;
  segment: SegmentSpec;
  maxTouchesPerPatient: number;
  autoEnroll: boolean;
  steps: { templateId: string; offsetDays: number; channel: "email" | "sms" }[];
}): Promise<Campaign> {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw new Error("Give the campaign a name — you will be reading it in the ledger.");
  if (input.steps.length === 0) throw new Error("A campaign needs at least one step.");

  const lengthGate = sequenceLengthAllowed(input.plan, input.steps.length);
  if (!lengthGate.ok) throw new Error(lengthGate.reason);

  for (const step of input.steps) {
    const gate = channelAllowed(input.plan, step.channel);
    if (!gate.ok) throw new Error(gate.reason);
  }

  const ordered = [...input.steps].sort((a, b) => a.offsetDays - b.offsetDays);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].offsetDays === ordered[i - 1].offsetDays) {
      throw new Error("Two steps cannot go out on the same day — space them out.");
    }
  }

  const owned = await db
    .select({ id: templates.id })
    .from(templates)
    .where(
      and(
        inArray(templates.id, ordered.map((s) => s.templateId)),
        or(eq(templates.practiceId, input.practiceId), isNull(templates.practiceId))!,
      ),
    );
  if (owned.length !== new Set(ordered.map((s) => s.templateId)).size) {
    throw new Error("One of those templates does not belong to this practice.");
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({
      locationId: input.locationId,
      name,
      segment: {
        buckets: normalizeBuckets(input.segment.buckets),
        requiresEmail: input.segment.requiresEmail ?? false,
        requiresSms: input.segment.requiresSms ?? false,
        excludeEnrolled: input.segment.excludeEnrolled ?? true,
      },
      status: "draft",
      maxTouchesPerPatient: Math.max(1, Math.min(10, input.maxTouchesPerPatient)),
      autoEnroll: input.autoEnroll,
    })
    .returning();

  await db.insert(campaignSteps).values(
    ordered.map((s, idx) => ({
      campaignId: campaign.id,
      stepOrder: idx + 1,
      offsetDays: s.offsetDays,
      channel: s.channel,
      templateId: s.templateId,
    })),
  );

  await audit({
    practiceId: input.practiceId,
    actorId: input.actorId,
    action: "campaign.created",
    target: `campaign:${campaign.id}`,
    metadata: { steps: ordered.length, buckets: campaign.segment.buckets },
  });

  return campaign;
}

/**
 * Launch: snapshot the segment into enrollments and start the sequence.
 *
 * The first step is scheduled for now rather than sent inline — the send path is
 * the tick's, always, so a launch cannot half-send 600 emails inside a form POST
 * that times out at 30 seconds.
 */
export async function launchCampaign(input: {
  campaignId: string;
  locationIds: string[];
  practiceId: string;
  actorId: string;
  today?: Date;
}): Promise<{ enrolled: number }> {
  const db = getDb();
  const campaign = await requireCampaign(input.campaignId, input.locationIds);
  if (campaign.status === "running") throw new Error("That campaign is already running.");

  const [practice] = await db.select().from(practices).where(eq(practices.id, input.practiceId));
  const gate = sendingAllowed(practice);
  if (!gate.ok) throw new Error(gate.reason);

  const steps = await db
    .select()
    .from(campaignSteps)
    .where(eq(campaignSteps.campaignId, campaign.id))
    .orderBy(asc(campaignSteps.stepOrder));
  if (steps.length === 0) throw new Error("Add at least one step before launching.");
  for (const step of steps) {
    const channelGate = channelAllowed(practice.plan, step.channel);
    if (!channelGate.ok) throw new Error(channelGate.reason);
  }

  const enrolled = await enrollSegment({
    campaign,
    today: input.today,
  });

  await db
    .update(campaigns)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(campaigns.id, campaign.id));

  await audit({
    practiceId: input.practiceId,
    actorId: input.actorId,
    action: "campaign.launched",
    target: `campaign:${campaign.id}`,
    metadata: { enrolled },
  });

  return { enrolled };
}

/** Enroll the segment's current matches. Used at launch and by daily auto-enroll. */
export async function enrollSegment(input: {
  campaign: Campaign;
  today?: Date;
  limit?: number;
}): Promise<number> {
  const db = getDb();
  const matches = await segmentPatients({
    locationId: input.campaign.locationId,
    segment: input.campaign.segment as SegmentSpec,
    campaignId: input.campaign.id,
    today: input.today,
    limit: input.limit,
  });
  if (matches.length === 0) return 0;

  const inserted = await db
    .insert(enrollments)
    .values(
      matches.map((p) => ({
        campaignId: input.campaign.id,
        patientId: p.id,
        status: "active" as const,
        nextStepOrder: 1,
        nextSendAt: new Date(),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: enrollments.id });
  return inserted.length;
}

export async function setCampaignStatus(input: {
  campaignId: string;
  locationIds: string[];
  practiceId: string;
  actorId: string;
  status: "running" | "paused" | "completed";
}): Promise<void> {
  const db = getDb();
  const campaign = await requireCampaign(input.campaignId, input.locationIds);
  await db
    .update(campaigns)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(campaigns.id, campaign.id));

  // Resuming repairs any active enrolment that lost its next-send time while the
  // campaign was paused, so a pause is never a silent end to the sequence.
  if (input.status === "running") {
    await db
      .update(enrollments)
      .set({ nextSendAt: new Date() })
      .where(
        and(
          eq(enrollments.campaignId, campaign.id),
          eq(enrollments.status, "active"),
          isNull(enrollments.nextSendAt),
        ),
      );
  }
  await audit({
    practiceId: input.practiceId,
    actorId: input.actorId,
    action: input.status === "paused" ? "campaign.paused" : "campaign.resumed",
    target: `campaign:${campaign.id}`,
    metadata: { status: input.status },
  });
}

async function requireCampaign(campaignId: string, locationIds: string[]): Promise<Campaign> {
  const db = getDb();
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), inArray(campaigns.locationId, locationIds)));
  if (!campaign) throw new Error("That campaign does not exist.");
  return campaign;
}

export async function listCampaigns(locationId: string, today?: Date): Promise<CampaignSummary[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.locationId, locationId))
    .orderBy(desc(campaigns.createdAt));

  const summaries: CampaignSummary[] = [];
  for (const campaign of rows) {
    summaries.push(await campaignSummary(campaign, today));
  }
  return summaries;
}

export async function campaignSummary(campaign: Campaign, today?: Date): Promise<CampaignSummary> {
  const db = getDb();
  const steps = await db
    .select({
      step: campaignSteps,
      templateName: templates.name,
      subject: templates.subject,
    })
    .from(campaignSteps)
    .innerJoin(templates, eq(templates.id, campaignSteps.templateId))
    .where(eq(campaignSteps.campaignId, campaign.id))
    .orderBy(asc(campaignSteps.stepOrder));

  const [counts] = await db
    .select({
      enrolled: count(),
      active: sql<number>`count(*) filter (where ${enrollments.status} = 'active')::int`,
      stoppedBooked: sql<number>`count(*) filter (where ${enrollments.status} = 'stopped_booked')::int`,
    })
    .from(enrollments)
    .where(eq(enrollments.campaignId, campaign.id));

  const [touchCounts] = await db
    .select({ sent: sql<number>`count(*)::int` })
    .from(touches)
    .where(and(eq(touches.campaignId, campaign.id), ne(touches.status, "queued")));

  const segmentSize =
    campaign.status === "draft"
      ? (
          await segmentPatients({
            locationId: campaign.locationId,
            segment: campaign.segment as SegmentSpec,
            campaignId: campaign.id,
            today,
          })
        ).length
      : Number(counts?.enrolled ?? 0);

  return {
    campaign,
    steps: steps.map((s) => ({ ...s.step, templateName: s.templateName, subject: s.subject })),
    enrolled: Number(counts?.enrolled ?? 0),
    active: Number(counts?.active ?? 0),
    stoppedBooked: Number(counts?.stoppedBooked ?? 0),
    touchesSent: Number(touchCounts?.sent ?? 0),
    segmentSize,
  };
}

/** Per-step delivery counts for the campaign detail timeline. */
export async function stepStats(campaignId: string): Promise<Map<string, { sent: number; delivered: number; failed: number }>> {
  const db = getDb();
  const rows = await db
    .select({
      templateId: touches.templateId,
      sent: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) filter (where ${touches.status} = 'delivered')::int`,
      failed: sql<number>`count(*) filter (where ${touches.status} in ('bounced','failed'))::int`,
    })
    .from(touches)
    .where(eq(touches.campaignId, campaignId))
    .groupBy(touches.templateId);

  const out = new Map<string, { sent: number; delivered: number; failed: number }>();
  for (const r of rows) {
    if (!r.templateId) continue;
    out.set(r.templateId, { sent: r.sent, delivered: r.delivered, failed: r.failed });
  }
  return out;
}

/* -------------------------------------------------------------- the sending */

export interface StepOutcome {
  enrollmentId: string;
  result: "sent" | "deferred" | "stopped" | "completed";
  reason?: TouchDenial | "no_step" | "campaign_paused";
}

/**
 * Claim and run the enrollments whose next step is due.
 *
 * Claiming pushes `next_send_at` forward **in SQL** before any work happens, so
 * two ticks (the cron route and a worker, say) cannot send the same step twice.
 * The comparison is `now()` in the database rather than a JS `Date`: Postgres
 * keeps microseconds where JavaScript truncates to milliseconds, and a scheduler
 * that compares the two eventually claims nothing at all.
 */
export async function runDueSteps(input: {
  limit?: number;
  deadline?: number;
  now?: Date;
}): Promise<StepOutcome[]> {
  const db = getDb();
  const limit = input.limit ?? 200;

  const due = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .where(
      and(
        eq(enrollments.status, "active"),
        eq(campaigns.status, "running"),
        sql`${enrollments.nextSendAt} is not null`,
        lte(enrollments.nextSendAt, sql`now()`),
      ),
    )
    .orderBy(asc(enrollments.nextSendAt))
    .limit(limit);

  if (due.length === 0) return [];

  // Reserve them: anything claimed here is ours for the next ten minutes.
  const claimed = await db
    .update(enrollments)
    .set({ nextSendAt: sql`now() + interval '10 minutes'` })
    .where(and(inArray(enrollments.id, due.map((d) => d.id)), eq(enrollments.status, "active")))
    .returning({ id: enrollments.id });

  const outcomes: StepOutcome[] = [];
  for (const row of claimed) {
    if (input.deadline && Date.now() > input.deadline) break;
    outcomes.push(await sendStepTouch({ enrollmentId: row.id, now: input.now }));
  }
  return outcomes;
}

/**
 * One enrollment, one step. The only function in RecallDesk that sends anything.
 */
export async function sendStepTouch(input: {
  enrollmentId: string;
  now?: Date;
}): Promise<StepOutcome> {
  const db = getDb();
  const now = input.now ?? new Date();

  const [row] = await db
    .select({
      enrollment: enrollments,
      campaign: campaigns,
      patient: patients,
      location: locations,
      practice: practices,
    })
    .from(enrollments)
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .innerJoin(patients, eq(patients.id, enrollments.patientId))
    .innerJoin(locations, eq(locations.id, campaigns.locationId))
    .innerJoin(practices, eq(practices.id, locations.practiceId))
    .where(eq(enrollments.id, input.enrollmentId));

  if (!row) return { enrollmentId: input.enrollmentId, result: "stopped", reason: "no_step" };
  const { enrollment, campaign, patient, location, practice } = row;

  // A paused campaign or a lapsed subscription **defers**, and the deferral is a
  // time, never null. Setting `next_send_at` to null here was a real bug: an
  // enrollment with no next send is invisible to `runDueSteps` forever, so pausing
  // a campaign and resuming it silently ended the sequence for everyone in it.
  if (campaign.status !== "running") {
    await db
      .update(enrollments)
      .set({ nextSendAt: new Date(now.getTime() + 3_600_000) })
      .where(eq(enrollments.id, enrollment.id));
    return { enrollmentId: enrollment.id, result: "deferred", reason: "campaign_paused" };
  }

  // Billing gate: a lapsed practice stops sending. Reading is never blocked.
  const billing = sendingAllowed(practice, now);
  if (!billing.ok) {
    await db
      .update(enrollments)
      .set({ nextSendAt: new Date(now.getTime() + 6 * 3_600_000) })
      .where(eq(enrollments.id, enrollment.id));
    return { enrollmentId: enrollment.id, result: "deferred", reason: "campaign_paused" };
  }

  const [step] = await db
    .select({ step: campaignSteps, template: templates })
    .from(campaignSteps)
    .innerJoin(templates, eq(templates.id, campaignSteps.templateId))
    .where(
      and(
        eq(campaignSteps.campaignId, campaign.id),
        eq(campaignSteps.stepOrder, enrollment.nextStepOrder),
      ),
    );

  if (!step) {
    await db
      .update(enrollments)
      .set({ status: "completed", nextSendAt: null })
      .where(eq(enrollments.id, enrollment.id));
    return { enrollmentId: enrollment.id, result: "completed" };
  }

  const [{ n: touchesInCampaign }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(touches)
    .where(
      and(
        eq(touches.campaignId, campaign.id),
        eq(touches.patientId, patient.id),
        ne(touches.status, "queued"),
      ),
    );

  const hourAgo = new Date(now.getTime() - 3_600_000);
  const [{ n: sentThisHour }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(touches)
    .where(
      and(
        eq(touches.locationId, location.id),
        ne(touches.channel, "call"),
        gte(touches.occurredAt, hourAgo),
      ),
    );

  const decision = decideTouch({
    channel: step.step.channel === "sms" ? "sms" : "email",
    patient: {
      doNotContact: patient.doNotContact,
      status: patient.status,
      email: patient.email,
      phone: patient.phone,
      emailConsent: patient.emailConsent,
      smsConsent: patient.smsConsent,
      emailOptedOutAt: patient.emailOptedOutAt,
      smsOptedOutAt: patient.smsOptedOutAt,
      emailBouncedAt: patient.emailBouncedAt,
      phoneFailedAt: patient.phoneFailedAt,
    },
    location,
    touchesInCampaign,
    maxTouchesPerPatient: campaign.maxTouchesPerPatient,
    sentThisHour,
    now,
  });

  if (!decision.ok) {
    if (decision.retryable) {
      // Wait for the location's morning (or the next hour) rather than spinning.
      const retryAt =
        decision.reason === "quiet_hours"
          ? nextSendableAt(location, now)
          : new Date(now.getTime() + 3_600_000);
      await db
        .update(enrollments)
        .set({ nextSendAt: retryAt })
        .where(eq(enrollments.id, enrollment.id));
      return { enrollmentId: enrollment.id, result: "deferred", reason: decision.reason };
    }
    // Terminal for this patient: stop the enrollment, do not retry forever. The
    // status says why (lib/consent.enrollmentStatusForDenial).
    const terminalStatus = enrollmentStatusForDenial(decision.reason) ?? "stopped_manual";
    await db
      .update(enrollments)
      .set({ status: terminalStatus, nextSendAt: null })
      .where(eq(enrollments.id, enrollment.id));
    return { enrollmentId: enrollment.id, result: "stopped", reason: decision.reason };
  }

  // --- render ---
  const bookingToken = await mintBookingToken({
    patientId: patient.id,
    locationId: location.id,
    touchId: null,
  });
  const stopToken = await mintStopToken(patient.id);
  const appUrl = env.appUrl;
  const values = {
    first_name: patient.firstName,
    last_name: patient.lastName,
    practice_name: practice.name,
    location_name: location.name,
    location_phone: phoneDisplay(location.phone) || practice.name,
    due_since: patient.nextDueOn ? formatMonthYear(patient.nextDueOn) : "",
    last_visit: patient.lastVisitOn ? formatMonthYear(patient.lastVisitOn) : "",
    booking_link: bookingUrl(appUrl, bookingToken),
    unsubscribe_link: stopUrl(appUrl, stopToken),
  };

  const rendered = renderTemplate(step.template.body, values);
  if (rendered.missing.length || rendered.unknown.length) {
    // "Hi , it's been a while" is not going out. Stop this patient's enrollment
    // and leave the reason visible rather than sending a broken message.
    await db
      .update(enrollments)
      .set({ status: "stopped_manual", nextSendAt: null })
      .where(eq(enrollments.id, enrollment.id));
    await db.insert(touches).values({
      patientId: patient.id,
      locationId: location.id,
      campaignId: campaign.id,
      channel: step.step.channel,
      templateId: step.template.id,
      status: "failed",
      occurredAt: now,
    });
    return { enrollmentId: enrollment.id, result: "stopped", reason: "no_step" };
  }

  const [touch] = await db
    .insert(touches)
    .values({
      patientId: patient.id,
      locationId: location.id,
      campaignId: campaign.id,
      channel: step.step.channel,
      templateId: step.template.id,
      status: "queued",
      bookingTokenHash: tokenFingerprint(bookingToken),
      occurredAt: now,
    })
    .returning();

  try {
    if (step.step.channel === "sms") {
      const sms = finalizeSms(rendered.text);
      const result = await sendSms({
        to: patient.phone!,
        body: sms.body,
        from: location.smsFromNumber,
        patientId: patient.id,
        templateId: step.template.id,
      });
      await db
        .update(touches)
        .set({ status: "sent", providerMessageId: result.providerMessageId })
        .where(eq(touches.id, touch.id));
    } else {
      const subjectRender = renderTemplate(step.template.subject ?? "Time for your next visit", values);
      const result = await sendEmail({
        to: patient.email!,
        subject: subjectRender.text,
        text: finalizeEmail(rendered.text, values.unsubscribe_link),
        patientId: patient.id,
        templateId: step.template.id,
        unsubscribeUrl: values.unsubscribe_link,
      });
      await db
        .update(touches)
        .set({ status: "sent", providerMessageId: result.providerMessageId })
        .where(eq(touches.id, touch.id));
    }
  } catch {
    // The provider refused. Record it as failed — it is not a qualifying touch,
    // so it can never earn an attribution — and try the next step on schedule.
    await db.update(touches).set({ status: "failed" }).where(eq(touches.id, touch.id));
  }

  // --- advance the sequence ---
  const [nextStep] = await db
    .select()
    .from(campaignSteps)
    .where(
      and(
        eq(campaignSteps.campaignId, campaign.id),
        eq(campaignSteps.stepOrder, enrollment.nextStepOrder + 1),
      ),
    );

  if (nextStep) {
    const base = enrollment.enrolledAt.getTime();
    const at = new Date(base + nextStep.offsetDays * 86_400_000);
    await db
      .update(enrollments)
      .set({
        nextStepOrder: enrollment.nextStepOrder + 1,
        nextSendAt: at.getTime() > now.getTime() ? at : now,
      })
      .where(eq(enrollments.id, enrollment.id));
  } else {
    await db
      .update(enrollments)
      .set({ status: "completed", nextSendAt: null })
      .where(eq(enrollments.id, enrollment.id));
  }

  return { enrollmentId: enrollment.id, result: "sent" };
}

/**
 * Stop a patient's active enrollments. Called when they book (from any source),
 * opt out, or are marked do-not-contact.
 *
 * "A booked patient's active enrollments stop before the next step sends" is a
 * ROADMAP acceptance criterion, and the reason is obvious to anyone who has
 * received a "we miss you!" text the morning after making an appointment.
 */
export async function stopEnrollmentsFor(input: {
  patientId: string;
  reason: "booked" | "opt_out" | "manual";
}): Promise<number> {
  const db = getDb();
  const status =
    input.reason === "booked"
      ? "stopped_booked"
      : input.reason === "opt_out"
        ? "stopped_opt_out"
        : "stopped_manual";
  const stopped = await db
    .update(enrollments)
    .set({ status, nextSendAt: null })
    .where(and(eq(enrollments.patientId, input.patientId), eq(enrollments.status, "active")))
    .returning({ id: enrollments.id });
  return stopped.length;
}

/* --------------------------------------------------------- suppression */

/**
 * Provider feedback and patient opt-outs, in one place.
 *
 * Suppression is per channel and permanent: a bounce sets `email_bounced_at`, a
 * STOP sets `sms_opted_out_at` and clears the consent flag, and neither is ever
 * undone by a later import (see server/imports.ts).
 */
export async function applyProviderEvent(input: {
  providerMessageId?: string | null;
  patientId?: string | null;
  event: "delivered" | "bounced" | "failed" | "opted_out" | "complained";
  channel: "email" | "sms";
}): Promise<{ touchUpdated: boolean; patientId: string | null }> {
  const db = getDb();
  let patientId = input.patientId ?? null;
  let touchUpdated = false;

  if (input.providerMessageId) {
    const [touch] = await db
      .select()
      .from(touches)
      .where(eq(touches.providerMessageId, input.providerMessageId))
      .orderBy(desc(touches.occurredAt))
      .limit(1);
    if (touch) {
      patientId = touch.patientId;
      const status =
        input.event === "delivered"
          ? "delivered"
          : input.event === "bounced"
            ? "bounced"
            : input.event === "opted_out"
              ? "opted_out"
              : "failed";
      await db.update(touches).set({ status }).where(eq(touches.id, touch.id));
      touchUpdated = true;
    }
  }

  if (!patientId) return { touchUpdated, patientId: null };

  const now = new Date();
  if (input.event === "bounced" && input.channel === "email") {
    await db
      .update(patients)
      .set({ emailBouncedAt: now, updatedAt: now })
      .where(and(eq(patients.id, patientId), isNull(patients.emailBouncedAt)));
  }
  if (input.event === "failed" && input.channel === "sms") {
    await db
      .update(patients)
      .set({ phoneFailedAt: now, updatedAt: now })
      .where(and(eq(patients.id, patientId), isNull(patients.phoneFailedAt)));
  }
  if (input.event === "opted_out" || input.event === "complained") {
    await optOutPatient({ patientId, channel: input.channel });
  }

  return { touchUpdated, patientId };
}

/** The permanent, per-channel opt-out. STOP and email unsubscribe both land here. */
export async function optOutPatient(input: {
  patientId: string;
  channel: "email" | "sms";
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  if (input.channel === "sms") {
    await db
      .update(patients)
      .set({ smsConsent: false, smsOptedOutAt: now, updatedAt: now })
      .where(eq(patients.id, input.patientId));
  } else {
    await db
      .update(patients)
      .set({ emailConsent: false, emailOptedOutAt: now, updatedAt: now })
      .where(eq(patients.id, input.patientId));
  }
  await stopEnrollmentsFor({ patientId: input.patientId, reason: "opt_out" });
}

export async function listTemplates(practiceId: string): Promise<Template[]> {
  return getDb()
    .select()
    .from(templates)
    .where(or(eq(templates.practiceId, practiceId), isNull(templates.practiceId))!)
    .orderBy(asc(templates.channel), asc(templates.name));
}

export async function locationsForPractice(practiceId: string): Promise<Location[]> {
  return getDb()
    .select()
    .from(locations)
    .where(eq(locations.practiceId, practiceId))
    .orderBy(asc(locations.createdAt));
}
