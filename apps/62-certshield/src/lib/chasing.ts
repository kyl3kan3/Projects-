/**
 * src/lib/chasing.ts
 *
 * The chasing ladder against the database: which engagements are owed a chase, and
 * sending it exactly once.
 *
 * The exactly-once guarantee is the unique index on
 * `(engagement_id, kind, expiry_cycle)`, not application logic. `sendChase` inserts
 * the ledger row **before** the email goes out and lets a conflict decide the race:
 * two overlapping nightly passes cannot both win the insert, so at most one of them
 * sends. The cost of that ordering is that a provider failure leaves a ledger row
 * with no delivery — so the failure is recorded on the row (`provider_message_id`
 * stays null) and the timeline shows it, which is better than the alternative,
 * where a crash between send and record means the vendor gets the same letter every
 * night for a month.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { chases, type Chase, type ChaseKind, type Org } from "@/db/schema";
import { chaseMessage } from "@/lib/chase-copy";
import { sendEmail } from "@/lib/email";
import { ledgerKey, nextChase, normaliseOffsets, CHASE_ORDER } from "@/lib/ladder";
import { uploadUrl } from "@/lib/tokens";
import { plainDate } from "@/lib/dates";
import { chaseRecipients } from "@/lib/vendors";
import { engagementViews, type EngagementView } from "@/lib/verdicts";
import { orgToday } from "@/lib/verdicts";
import { appendAudit } from "@/lib/audit";
import { env } from "@/lib/env";

export interface DueChaseRow {
  view: EngagementView;
  kind: ChaseKind;
  expiryCycle: string;
}

interface LedgerState {
  /** Rungs already sent, as `${kind}:${cycle}`. */
  keys: Set<string>;
  /** Whether anything at all went out to this engagement today. */
  chasedToday: boolean;
}

/** Every chase already in the ledger for these engagements. */
async function ledgerFor(
  engagementIds: string[],
  today: string,
  timeZone: string,
): Promise<Map<string, LedgerState>> {
  const out = new Map<string, LedgerState>();
  if (!engagementIds.length) return out;
  const db = getDb();
  const rows = await db
    .select()
    .from(chases)
    .where(inArray(chases.engagementId, engagementIds));
  for (const row of rows) {
    const state = out.get(row.engagementId) ?? { keys: new Set<string>(), chasedToday: false };
    state.keys.add(ledgerKey(row.kind, row.expiryCycle));
    if (plainDate(row.sentAt, timeZone) === today) state.chasedToday = true;
    out.set(row.engagementId, state);
  }
  return out;
}

/**
 * Which engagements are owed a chase today. Skips vendors with nobody to chase —
 * a ledger row claiming a letter was sent to no address is worse than no row.
 */
export async function dueChases(
  org: Org,
  at: Date = new Date(),
  views?: EngagementView[],
): Promise<DueChaseRow[]> {
  const list = views ?? (await engagementViews(org, {}, at));
  if (!list.length) return [];
  const today = orgToday(org, at);
  const ledger = await ledgerFor(
    list.map((v) => v.engagement.id),
    today,
    org.timezone || "UTC",
  );
  const offsets = normaliseOffsets(org.settings?.chaseOffsets);

  const due: DueChaseRow[] = [];
  for (const view of list) {
    if (view.vendor.status !== "active") continue;
    if (!chaseRecipients(view.vendor).length) continue;
    const state = ledger.get(view.engagement.id);
    const result = nextChase({
      status: view.verdict.status,
      soonestExpiry: view.verdict.soonestExpiry,
      daysToExpiry: view.verdict.daysToExpiry,
      today,
      offsets,
      sent: state?.keys ?? new Set(),
      chasedToday: state?.chasedToday ?? false,
    });
    if (result) due.push({ view, kind: result.kind, expiryCycle: result.expiryCycle });
  }
  return due.sort((a, b) => CHASE_ORDER[b.kind] - CHASE_ORDER[a.kind]);
}

export type SendOutcome = "sent" | "already_sent" | "no_recipients" | "no_link" | "failed";

/**
 * Send one chase. Claims the ledger row first; a duplicate key means another pass
 * already has it and this one returns without sending.
 */
export async function sendChase(
  org: Org,
  row: DueChaseRow,
  opts: { actor?: string; at?: Date } = {},
): Promise<{ outcome: SendOutcome; error?: string }> {
  const actor = opts.actor ?? "system (nightly chase)";
  // The ledger row is stamped with the pass's own clock, not `now()`. It is the
  // same instant in production, and it is what makes a time-travelled simulation of
  // a whole renewal cycle mean anything.
  const at = opts.at ?? new Date();
  const { view, kind, expiryCycle } = row;
  const to = chaseRecipients(view.vendor);
  if (!to.length) return { outcome: "no_recipients" };

  const db = getDb();
  const [claimed] = await db
    .insert(chases)
    .values({ engagementId: view.engagement.id, kind, expiryCycle, sentTo: to, sentAt: at })
    .onConflictDoNothing({ target: [chases.engagementId, chases.kind, chases.expiryCycle] })
    .returning();
  if (!claimed) return { outcome: "already_sent" };

  // The link is re-minted per chase: the raw token was never stored (only its
  // HMAC), so the only way to put a working link in an email is to issue one. A
  // forwarded older link stops working, which is the right trade for a credential
  // that can write into a compliance file.
  let token: string;
  try {
    const { issueUploadToken } = await import("@/lib/tokens");
    token = await issueUploadToken(view.vendor.id);
  } catch {
    return { outcome: "no_link" };
  }

  const message = chaseMessage(kind, {
    orgName: org.name,
    vendorName: view.vendor.name,
    propertyName: view.property.name,
    uploadUrl: uploadUrl(token, env.appUrl),
    expiresOn: view.verdict.soonestExpiry,
    daysToExpiry: view.verdict.daysToExpiry,
    deficiencies: view.verdict.deficiencies,
    signature: org.settings?.tone === "firm" ? "Compliance" : "Compliance team",
  });

  const result = await sendEmail({ to, subject: message.subject, text: message.text });
  if (result.providerMessageId) {
    await db
      .update(chases)
      .set({ providerMessageId: result.providerMessageId })
      .where(eq(chases.id, claimed.id));
  }

  await appendAudit({
    orgId: org.id,
    actor,
    action: "chase.sent",
    target: `${view.vendor.name} — ${view.property.name}`,
    metadata: {
      kind,
      expiryCycle,
      to,
      simulated: result.simulated,
      ok: result.ok,
      error: result.error ?? null,
    },
  });

  if (!result.ok) return { outcome: "failed", error: result.error };
  return { outcome: "sent" };
}

/* -------------------------------------------------------------------- reads */

export async function chaseTimeline(engagementId: string): Promise<Chase[]> {
  const db = getDb();
  return db
    .select()
    .from(chases)
    .where(eq(chases.engagementId, engagementId))
    .orderBy(desc(chases.sentAt));
}

export async function chasesForEngagements(engagementIds: string[]): Promise<Chase[]> {
  if (!engagementIds.length) return [];
  const db = getDb();
  return db
    .select()
    .from(chases)
    .where(inArray(chases.engagementId, engagementIds))
    .orderBy(desc(chases.sentAt));
}

/** Has this exact rung already gone out for this cycle? Used by the UI's preview. */
export async function chaseAlreadySent(
  engagementId: string,
  kind: ChaseKind,
  expiryCycle: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: chases.id })
    .from(chases)
    .where(
      and(
        eq(chases.engagementId, engagementId),
        eq(chases.kind, kind),
        eq(chases.expiryCycle, expiryCycle),
      ),
    );
  return Boolean(row);
}
