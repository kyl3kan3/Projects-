/**
 * src/lib/scan.ts
 *
 * The morning scan — the 6am artifact. One email and/or Slack post per firm at
 * their local scan hour: new matches by score with their reasons, notices whose
 * dates moved, pursuits closing within seven days, and per-source health.
 *
 * ## Two laws
 *
 * **The scan always sends.** A no-new-matches morning sends the one quiet line
 * ("No new matches. 3,412 notices scanned across 6 sources.") because silence
 * has to be distinguishable from breakage. `composeScan` can never return null.
 *
 * **A match is announced once.** The "new" state stays true until a human looks
 * at it, so a scan keyed off state alone would re-announce the same tender every
 * morning until the firm muted the product. Announcements are pinned to the
 * event with `matches.notified_at`, stamped only after a send succeeded.
 */

import { and, desc, eq, gt, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  DEFAULT_SCAN_HOUR,
  deadlines,
  firmSettings,
  firms,
  keywordProfiles,
  matches,
  notifications,
  opportunities,
  opportunityEvents,
  pursuits,
  sources,
  users,
  type Firm,
  type MatchFactor,
} from "@/db/schema";
import { env } from "@/lib/env";
import {
  formatCountdown,
  formatDay,
  formatDayTime,
  formatFetchedAt,
  formatTime,
  formatValueBand,
  formatWeekday,
  stageLabel,
  zonedDateKey,
  zonedHour,
} from "@/lib/format";
import {
  scanEmail,
  scanSlack,
  type ScanContext,
  type ScanDateChangeLine,
  type ScanExpiringLine,
  type ScanMatchLine,
  type ScanSourceLine,
} from "@/lib/emails";
import { claimNotification, postSlack, sendEmail, settleNotification } from "@/lib/notify";
import { topReasons } from "@/lib/scoring";

/** How many matches the digest carries before "open the radar for the rest". */
const MAX_MATCHES = 8;
/** How far back an "open notice" counts as part of the scanned register. */
const REGISTER_WINDOW_DAYS = 120;

export interface MorningScan {
  firmId: string;
  /** Match ids carried by this scan — stamped `notified_at` once it sends. */
  matchIds: string[];
  context: ScanContext;
  quiet: boolean;
}

/**
 * Compose the scan. Never returns null: the quiet-line variant is still a scan.
 */
export async function composeScan(firmId: string, now: Date = new Date()): Promise<MorningScan> {
  const db = getDb();
  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId));
  if (!firm) throw new Error(`No such firm: ${firmId}`);
  const tz = firm.timezone;

  /* -- the register that was scanned ------------------------------------- */
  const since = new Date(now.getTime() - REGISTER_WINDOW_DAYS * 86_400_000);
  const [registerCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(
      and(
        gte(opportunities.postedAt, since),
        ne(opportunities.oppStatus, "cancelled"),
        or(isNull(opportunities.responsesDueAt), gte(opportunities.responsesDueAt, now)),
      ),
    );
  const allSources = await db.select().from(sources).orderBy(sources.name);

  /* -- new matches, never announced before -------------------------------- */
  const newRows = await db
    .select({
      match: matches,
      opportunity: opportunities,
      sourceName: sources.name,
    })
    .from(matches)
    .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
    .innerJoin(sources, eq(opportunities.sourceId, sources.id))
    .where(
      and(eq(matches.firmId, firmId), eq(matches.state, "new"), isNull(matches.notifiedAt)),
    )
    .orderBy(desc(matches.score), desc(opportunities.postedAt))
    .limit(MAX_MATCHES);

  const newMatches: ScanMatchLine[] = newRows.map((row) => {
    const factors = (row.match.factors ?? []) as MatchFactor[];
    return {
      score: row.match.score,
      title: row.opportunity.title,
      agency: row.opportunity.agency,
      noticeId: row.opportunity.externalId,
      dueText: row.opportunity.responsesDueAt ? formatDay(row.opportunity.responsesDueAt, tz) : null,
      countdown: row.opportunity.responsesDueAt
        ? formatCountdown(row.opportunity.responsesDueAt, tz, now)
        : null,
      valueBand: formatValueBand(row.opportunity.estValueBand as never),
      reasons: topReasons(factors, 3).map((factor) => factor.reason),
      url: `${env.appUrl}/radar/${row.match.id}`,
    };
  });

  /* -- notices whose dates moved since the last scan ---------------------- */
  const [lastScan] = await db
    .select({ occurredAt: notifications.occurredAt })
    .from(notifications)
    .where(and(eq(notifications.firmId, firmId), eq(notifications.kind, "morning_scan")))
    .orderBy(desc(notifications.occurredAt))
    .limit(1);
  const changesSince = lastScan?.occurredAt ?? new Date(now.getTime() - 86_400_000);

  const watchedOpportunityIds = await db
    .selectDistinct({ id: matches.opportunityId })
    .from(matches)
    .where(
      and(
        eq(matches.firmId, firmId),
        inArray(matches.state, ["new", "seen", "pursued"]),
      ),
    );

  const dateChanges: ScanDateChangeLine[] = [];
  if (watchedOpportunityIds.length > 0) {
    const events = await db
      .select({ event: opportunityEvents, opportunity: opportunities })
      .from(opportunityEvents)
      .innerJoin(opportunities, eq(opportunityEvents.opportunityId, opportunities.id))
      .where(
        and(
          inArray(
            opportunityEvents.opportunityId,
            watchedOpportunityIds.map((row) => row.id),
          ),
          inArray(opportunityEvents.kind, ["date_changed", "cancelled", "amended"]),
          // Typed operator, never a Date inside a raw sql fragment.
          gt(opportunityEvents.occurredAt, changesSince),
        ),
      )
      .orderBy(desc(opportunityEvents.occurredAt))
      .limit(10);

    for (const row of events) {
      dateChanges.push({
        title: row.opportunity.title,
        detail: describeEvent(row.event.kind, row.event.detail, tz),
        url: row.opportunity.url,
      });
    }
  }

  /* -- pursuits closing within seven days -------------------------------- */
  const horizon = new Date(now.getTime() + 7 * 86_400_000);
  const expiringRows = await db
    .select({ pursuit: pursuits, deadline: deadlines })
    .from(deadlines)
    .innerJoin(pursuits, eq(deadlines.pursuitId, pursuits.id))
    .where(
      and(
        eq(deadlines.firmId, firmId),
        isNull(deadlines.completedAt),
        gte(deadlines.dueAt, now),
        lte(deadlines.dueAt, horizon),
        inArray(pursuits.stage, ["watching", "go_no_go", "drafting"]),
      ),
    )
    .orderBy(deadlines.dueAt)
    .limit(10);

  const expiring: ScanExpiringLine[] = expiringRows.map((row) => ({
    title: row.pursuit.title,
    stage: stageLabel(row.pursuit.stage),
    dueText: formatDayTime(row.deadline.dueAt, tz),
    countdown: formatCountdown(row.deadline.dueAt, tz, now),
    url: `${env.appUrl}/pursuits/${row.pursuit.id}`,
  }));

  /* -- source health, honestly ------------------------------------------- */
  const sourceLines: ScanSourceLine[] = allSources.map((source) => ({
    name: source.name,
    status: source.status,
    lastSuccess: formatFetchedAt(source.lastSuccessAt, tz, now),
    note: source.statusNote,
  }));

  const context: ScanContext = {
    firmName: firm.name,
    dateLine: `${formatWeekday(now, tz)} ${formatDay(now, tz)} · ${formatTime(now, tz)}`,
    scannedCount: registerCount?.count ?? 0,
    sourceCount: allSources.length,
    quiet: newMatches.length === 0,
    newMatches,
    dateChanges,
    expiring,
    sources: sourceLines,
    appUrl: env.appUrl,
  };

  return {
    firmId,
    matchIds: newRows.map((row) => row.match.id),
    context,
    quiet: newMatches.length === 0,
  };
}

function describeEvent(kind: string, detail: unknown, tz: string): string {
  if (kind === "cancelled") return "Notice cancelled by the issuing agency.";
  const changes = (detail as { changes?: Array<{ field: string; old: string | null; new: string | null }> })
    ?.changes;
  if (Array.isArray(changes) && changes.length > 0) {
    return changes
      .map((change) => {
        const label = change.field === "questionsDueAt" ? "Questions due" : "Proposal due";
        const before = change.old ? formatDay(new Date(change.old), tz) : "not set";
        const after = change.new ? formatDay(new Date(change.new), tz) : "removed";
        return `${label}: ${before} → ${after}`;
      })
      .join(" · ");
  }
  return "Notice amended — text or attachments changed.";
}

/* ------------------------------------------------------------------ sending */

export interface SendScanResult {
  email: boolean;
  slack: boolean;
  /** True when this firm's scan for this local day had already been sent. */
  skipped: boolean;
  quiet: boolean;
  matchCount: number;
  errors: string[];
}

/**
 * Send the scan for one firm. Claims per-channel dedupe keys scoped to the
 * firm's *local* date, so a firm in Honolulu and one in Boston each get exactly
 * one scan on their own morning, no matter how often the sweep runs.
 */
export async function sendScan(firmId: string, now: Date = new Date()): Promise<SendScanResult> {
  const db = getDb();
  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId));
  if (!firm) throw new Error(`No such firm: ${firmId}`);

  const dayKey = zonedDateKey(now, firm.timezone);
  const result: SendScanResult = {
    email: false,
    slack: false,
    skipped: false,
    quiet: false,
    matchCount: 0,
    errors: [],
  };

  const seats = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.firmId, firm.id));
  const recipients = seats.map((seat) => seat.email);

  const emailClaim =
    recipients.length > 0
      ? await claimNotification({
          firmId: firm.id,
          channel: "email",
          kind: "morning_scan",
          dedupeKey: `morning_scan:${firm.id}:${dayKey}:email`,
        })
      : null;
  const slackClaim = firm.slackWebhookUrl
    ? await claimNotification({
        firmId: firm.id,
        channel: "slack",
        kind: "morning_scan",
        dedupeKey: `morning_scan:${firm.id}:${dayKey}:slack`,
      })
    : null;

  if (!emailClaim && !slackClaim) {
    result.skipped = true;
    return result;
  }

  const scan = await composeScan(firm.id, now);
  result.quiet = scan.quiet;
  result.matchCount = scan.context.newMatches.length;

  if (emailClaim) {
    const message = scanEmail(scan.context);
    const outcome = await sendEmail({ to: recipients, ...message });
    await settleNotification(emailClaim, outcome.ok ? "sent" : "failed", outcome.providerMessageId);
    result.email = outcome.ok;
    if (!outcome.ok && outcome.error) result.errors.push(`email: ${outcome.error}`);
  }

  if (slackClaim && firm.slackWebhookUrl) {
    const outcome = await postSlack(firm.slackWebhookUrl, scanSlack(scan.context));
    await settleNotification(slackClaim, outcome.ok ? "sent" : "failed", outcome.providerMessageId);
    result.slack = outcome.ok;
    if (!outcome.ok && outcome.error) result.errors.push(`slack: ${outcome.error}`);
  }

  // Stamp only what actually went out. A failed send leaves the matches
  // un-announced so tomorrow's scan carries them rather than losing them.
  if ((result.email || result.slack) && scan.matchIds.length > 0) {
    await db
      .update(matches)
      .set({ notifiedAt: now })
      .where(inArray(matches.id, scan.matchIds));
  }

  return result;
}

/**
 * Firms whose local clock has reached their scan hour. Called by the nightly /
 * hourly sweep; the per-firm dedupe key does the real work of preventing
 * duplicates, so this only has to be approximately right.
 */
export async function firmsDueForScan(now: Date = new Date()): Promise<Firm[]> {
  const all = await getDb().select().from(firms);
  return all.filter((firm) => {
    const hour = firmSettings(firm).scanHour ?? DEFAULT_SCAN_HOUR;
    return zonedHour(now, firm.timezone) >= hour;
  });
}

/**
 * Immediate alert for a hot match: score >= 90 on a notice closing within 14
 * days. Sent once per match, and the match is stamped announced so the morning
 * scan does not repeat it.
 */
export async function alertHotMatch(matchId: string, now: Date = new Date()): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ match: matches, opportunity: opportunities, firm: firms, profile: keywordProfiles })
    .from(matches)
    .innerJoin(opportunities, eq(matches.opportunityId, opportunities.id))
    .innerJoin(firms, eq(matches.firmId, firms.id))
    .innerJoin(keywordProfiles, eq(matches.keywordProfileId, keywordProfiles.id))
    .where(and(eq(matches.id, matchId), isNull(matches.notifiedAt)));
  if (!row) return false;

  const tz = row.firm.timezone;
  const factors = (row.match.factors ?? []) as MatchFactor[];
  const line: ScanMatchLine = {
    score: row.match.score,
    title: row.opportunity.title,
    agency: row.opportunity.agency,
    noticeId: row.opportunity.externalId,
    dueText: row.opportunity.responsesDueAt ? formatDay(row.opportunity.responsesDueAt, tz) : null,
    countdown: row.opportunity.responsesDueAt
      ? formatCountdown(row.opportunity.responsesDueAt, tz, now)
      : null,
    valueBand: formatValueBand(row.opportunity.estValueBand as never),
    reasons: topReasons(factors, 3).map((factor) => factor.reason),
    url: `${env.appUrl}/radar/${row.match.id}`,
  };

  const context: ScanContext = {
    firmName: row.firm.name,
    dateLine: `${formatWeekday(now, tz)} ${formatDay(now, tz)} · ${formatTime(now, tz)}`,
    scannedCount: 0,
    sourceCount: 0,
    quiet: false,
    newMatches: [line],
    dateChanges: [],
    expiring: [],
    sources: [],
    appUrl: env.appUrl,
  };

  const seats = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.firmId, row.firm.id));
  const recipients = seats.map((seat) => seat.email);
  let delivered = false;

  if (recipients.length > 0) {
    const claim = await claimNotification({
      firmId: row.firm.id,
      channel: "email",
      kind: "match",
      dedupeKey: `hot_match:${row.match.id}:email`,
    });
    if (claim) {
      const base = scanEmail(context);
      const outcome = await sendEmail({
        to: recipients,
        subject: `Closing in ${line.countdown ?? "days"} — fit ${line.score}: ${line.title}`,
        html: base.html,
        text: base.text,
      });
      await settleNotification(claim, outcome.ok ? "sent" : "failed", outcome.providerMessageId);
      delivered = delivered || outcome.ok;
    }
  }

  if (row.firm.slackWebhookUrl) {
    const claim = await claimNotification({
      firmId: row.firm.id,
      channel: "slack",
      kind: "match",
      dedupeKey: `hot_match:${row.match.id}:slack`,
    });
    if (claim) {
      const outcome = await postSlack(row.firm.slackWebhookUrl, scanSlack(context));
      await settleNotification(claim, outcome.ok ? "sent" : "failed", outcome.providerMessageId);
      delivered = delivered || outcome.ok;
    }
  }

  if (delivered) {
    await db.update(matches).set({ notifiedAt: now }).where(eq(matches.id, row.match.id));
  }
  return delivered;
}
