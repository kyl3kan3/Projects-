/**
 * The sequence engine: turning a firm's ladder into actual, dedicated,
 * once-only sends.
 *
 * The division of labour is deliberate:
 *
 *   src/lib/ladder.ts   decides WHICH rung (pure, exhaustively tested)
 *   this file           commits it ONCE and sends it (database + provider)
 *   Postgres            guarantees once, via unique(sequence_run_id, step_index)
 *
 * `commitRung` claims the rung by inserting the message row *before* attempting
 * delivery. If two sweeps race, or a lambda is retried, the second insert loses
 * on the unique index and returns "already claimed" instead of a second copy of
 * the same email landing in a client's inbox. A provider failure is recorded on
 * the claimed row rather than releasing the claim — a bad address must not make
 * the ladder retry the same rung every morning for a year. The failure is
 * visible on the invoice screen and in the audit log, which is where a human can
 * do something about it.
 *
 * Approval mode (the default) stops one step earlier: the row is claimed with
 * status `awaiting_approval` and nothing leaves until someone taps Approve.
 */

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  firms,
  invoices,
  messages,
  promises,
  replies,
  sequenceRuns,
  sequences,
  type Client,
  type EscalationLevel,
  type Firm,
  type Invoice,
  type Message,
  type Sequence,
  type SequenceRun,
  type SequenceStep,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { daysFromDue, daysOverdue, formatLongDate, today, type IsoDate } from "@/lib/dates";
import {
  DEFAULT_LADDER,
  decideNextRung,
  ladderStatusLine,
  nextRungDate,
  normalizeLadder,
  type LadderDecision,
  type LadderRunState,
  type LadderStatusLine,
} from "@/lib/ladder";
import { formatMoney } from "@/lib/money";
import { createPortalToken, portalUrl } from "@/lib/portal";
import { renderStep } from "@/lib/tone";
import { firmSettings, lateFeeSentence } from "@/lib/settings";
import { sendMail } from "@/lib/email";

/* -------------------------------------------------------------- sequences --- */

/** The firm's active ladder, creating the default one if it has none. */
export async function activeSequence(firmId: string): Promise<Sequence> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.firmId, firmId), eq(sequences.active, true)))
    .orderBy(asc(sequences.createdAt))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(sequences)
    .values({ firmId, name: "Default ladder", tone: "warm", steps: DEFAULT_LADDER, active: true })
    .returning();
  return created;
}

export async function saveLadder(
  firmId: string,
  steps: SequenceStep[],
  actor: string,
): Promise<Sequence> {
  const db = getDb();
  const sequence = await activeSequence(firmId);
  const normalized = normalizeLadder(steps);
  const [updated] = await db
    .update(sequences)
    .set({ steps: normalized })
    .where(eq(sequences.id, sequence.id))
    .returning();

  // Every open run's next date is derived from the ladder, so it must move too.
  const runs = await db
    .select({ run: sequenceRuns, invoice: invoices })
    .from(sequenceRuns)
    .innerJoin(invoices, eq(invoices.id, sequenceRuns.invoiceId))
    .where(
      and(
        eq(sequenceRuns.firmId, firmId),
        inArray(sequenceRuns.state, ["scheduled", "running", "paused_promise", "paused_reply"]),
      ),
    );
  for (const { run, invoice } of runs) {
    await db
      .update(sequenceRuns)
      .set({ nextSendOn: nextRungDate(normalized, invoice.dueAt, run.highestStepSent) })
      .where(eq(sequenceRuns.id, run.id));
  }

  await audit(firmId, actor, "ladder_updated", `${normalized.length} steps`, {
    offsets: normalized.map((s) => s.offsetDaysFromDue),
  });
  return updated;
}

/* ------------------------------------------------------------------- runs --- */

/** Create the run for an invoice if it does not have one yet. Idempotent. */
export async function ensureRun(
  firmId: string,
  invoice: Invoice,
  sequence: Sequence,
): Promise<SequenceRun> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(sequenceRuns)
    .where(eq(sequenceRuns.invoiceId, invoice.id));
  if (existing) return existing;

  const [created] = await db
    .insert(sequenceRuns)
    .values({
      firmId,
      invoiceId: invoice.id,
      sequenceId: sequence.id,
      state: "scheduled",
      highestStepSent: -1,
      nextSendOn: nextRungDate(sequence.steps, invoice.dueAt, -1),
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [row] = await db.select().from(sequenceRuns).where(eq(sequenceRuns.invoiceId, invoice.id));
  return row;
}

export async function stopRun(invoiceId: string, reason: string): Promise<void> {
  const db = getDb();
  await db
    .update(sequenceRuns)
    .set({ state: "stopped", stoppedReason: reason, nextSendOn: null, updatedAt: new Date() })
    .where(and(eq(sequenceRuns.invoiceId, invoiceId), ne(sequenceRuns.state, "completed")));
}

export async function resumeRun(firmId: string, invoiceId: string, actor: string): Promise<void> {
  const db = getDb();
  const [run] = await db
    .select()
    .from(sequenceRuns)
    .where(and(eq(sequenceRuns.firmId, firmId), eq(sequenceRuns.invoiceId, invoiceId)));
  if (!run) return;
  await db
    .update(sequenceRuns)
    .set({ state: "scheduled", pausedReason: null, stoppedReason: null, updatedAt: new Date() })
    .where(eq(sequenceRuns.id, run.id));
  await audit(firmId, actor, "sequence_resumed", invoiceId);
}

/** A reply pauses the run and asks for a human — stop-on-reply, per README. */
export async function recordReply(args: {
  firmId: string;
  invoiceId: string;
  messageId?: string | null;
  fromEmail: string;
  snippet: string;
  suggestedPromiseFor?: IsoDate | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(replies).values({
    firmId: args.firmId,
    invoiceId: args.invoiceId,
    messageId: args.messageId ?? null,
    fromEmail: args.fromEmail,
    snippet: args.snippet.slice(0, 600),
    suggestedPromiseFor: args.suggestedPromiseFor ?? null,
  });
  await db
    .update(sequenceRuns)
    .set({
      state: "paused_reply",
      pausedReason: `Reply from ${args.fromEmail}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sequenceRuns.invoiceId, args.invoiceId),
        inArray(sequenceRuns.state, ["scheduled", "running", "awaiting_approval", "paused_promise"]),
      ),
    );
  if (args.messageId) {
    await db.update(messages).set({ status: "replied" }).where(eq(messages.id, args.messageId));
  }
  await audit(args.firmId, SYSTEM, "reply_received", args.fromEmail, {
    invoiceId: args.invoiceId,
  });
}

/* ---------------------------------------------------------------- context --- */

export interface RunSubject {
  firm: Firm;
  invoice: Invoice;
  client: Client;
  sequence: Sequence;
  run: SequenceRun;
  hasOpenPromise: boolean;
}

function runState(subject: RunSubject): LadderRunState {
  return {
    highestStepSent: subject.run.highestStepSent,
    pausedByReply: subject.run.state === "paused_reply",
    hasOpenPromise: subject.hasOpenPromise,
    escalateAfterBrokenPromise: subject.run.escalateAfterBrokenPromise,
    stopped: subject.run.state === "stopped",
  };
}

export function ladderContextFor(subject: RunSubject, asOf: IsoDate) {
  return {
    ladder: subject.sequence.steps,
    invoice: {
      dueAt: subject.invoice.dueAt,
      balanceCents: subject.invoice.balanceCents,
      status: subject.invoice.status,
    },
    run: runState(subject),
    clientVip: subject.client.vip,
    firmPaused: subject.firm.followUpPaused,
    asOf,
  };
}

export function decisionFor(subject: RunSubject, asOf: IsoDate): LadderDecision {
  return decideNextRung(ladderContextFor(subject, asOf));
}

export function statusLineFor(subject: RunSubject, asOf: IsoDate): LadderStatusLine {
  return ladderStatusLine(ladderContextFor(subject, asOf));
}

/** Load everything the engine needs for one invoice. */
export async function loadRunSubject(
  firmId: string,
  invoiceId: string,
): Promise<RunSubject | null> {
  const db = getDb();
  const [row] = await db
    .select({ invoice: invoices, client: clients, firm: firms })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .innerJoin(firms, eq(firms.id, invoices.firmId))
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)));
  if (!row) return null;

  const sequence = await activeSequence(firmId);
  const run = await ensureRun(firmId, row.invoice, sequence);
  const [openPromise] = await db
    .select({ id: promises.id })
    .from(promises)
    .where(and(eq(promises.invoiceId, invoiceId), eq(promises.status, "open")))
    .limit(1);

  return { ...row, sequence, run, hasOpenPromise: Boolean(openPromise) };
}

/* --------------------------------------------------------------- rendering --- */

export interface PreparedSend {
  subject: string;
  text: string;
  html: string;
  toEmails: string[];
  portalToken: string;
  escalationLevel: EscalationLevel;
  promiseAware: boolean;
}

function firstName(value: string | null | undefined, fallback: string): string {
  const name = (value ?? "").trim();
  if (!name) return fallback;
  return name.split(/\s+/)[0];
}

/**
 * Render the exact bytes a rung would send. Used by the sender AND by the
 * approval tray's preview, so what a firm approves is what the client receives.
 */
export async function prepareSend(args: {
  subject: RunSubject;
  step: SequenceStep;
  promiseAware: boolean;
  asOf: IsoDate;
  promisedFor?: IsoDate | null;
}): Promise<PreparedSend> {
  const { firm, invoice, client } = args.subject;
  const settings = firmSettings(firm);
  const token = await createPortalToken({
    firmId: firm.id,
    clientId: client.id,
    invoiceId: invoice.id,
  });

  const rendered = renderStep({
    tone: args.subject.sequence.tone,
    level: args.step.escalationLevel,
    promiseAware: args.promiseAware,
    overrideSubject: args.step.subject,
    overrideBody: args.step.body,
    lateFeeSentence: lateFeeSentence(firm),
    ctx: {
      contactFirstName: firstName(client.contactName, "there"),
      clientName: client.name,
      firmName: firm.name,
      invoiceNumber: invoice.number,
      amount: formatMoney(invoice.balanceCents, invoice.currency),
      dueDate: formatLongDate(invoice.dueAt),
      daysOverdue: daysOverdue(invoice.dueAt, args.asOf),
      daysUntilDue: Math.max(0, -daysFromDue(invoice.dueAt, args.asOf)),
      portalUrl: portalUrl(token),
      signature: settings.signature || firm.name,
      promiseDate: args.promisedFor ? formatLongDate(args.promisedFor) : undefined,
    },
  });

  return {
    ...rendered,
    toEmails: client.emails.length ? client.emails : [],
    portalToken: token,
    escalationLevel: args.step.escalationLevel,
    promiseAware: args.promiseAware,
  };
}

/* --------------------------------------------------------------- committing --- */

export type CommitOutcome =
  | { outcome: "queued"; message: Message }
  | { outcome: "sent"; message: Message; delivered: boolean; error?: string }
  | { outcome: "already_claimed" }
  | { outcome: "no_recipient" };

/**
 * Claim a rung and either queue it for approval or send it.
 *
 * The claim (an insert against the unique index) happens first and is never
 * rolled back on a delivery failure — see the module note.
 */
export async function commitRung(args: {
  subject: RunSubject;
  stepIndex: number;
  step: SequenceStep;
  promiseAware: boolean;
  asOf: IsoDate;
  promisedFor?: IsoDate | null;
  /** Override the firm's send mode — used by "send this now" from the UI. */
  forceSend?: boolean;
  actor?: string;
}): Promise<CommitOutcome> {
  const db = getDb();
  const { firm, invoice, client, run } = args.subject;

  const prepared = await prepareSend({
    subject: args.subject,
    step: args.step,
    promiseAware: args.promiseAware,
    asOf: args.asOf,
    promisedFor: args.promisedFor,
  });

  if (prepared.toEmails.length === 0) return { outcome: "no_recipient" };

  const autopilot = args.forceSend || firm.sendMode === "autopilot";

  const claimed = await db
    .insert(messages)
    .values({
      firmId: firm.id,
      sequenceRunId: run.id,
      invoiceId: invoice.id,
      stepIndex: args.stepIndex,
      escalationLevel: prepared.escalationLevel,
      promiseAware: prepared.promiseAware,
      toEmails: prepared.toEmails,
      subject: prepared.subject,
      bodySnapshot: prepared.text,
      portalToken: prepared.portalToken,
      status: autopilot ? "queued" : "awaiting_approval",
    })
    .onConflictDoNothing({ target: [messages.sequenceRunId, messages.stepIndex] })
    .returning();

  if (claimed.length === 0) return { outcome: "already_claimed" };
  const message = claimed[0];

  // The run advances the moment the rung is claimed, whether it goes out now or
  // waits for approval — otherwise the sweep would queue the same rung tomorrow.
  await db
    .update(sequenceRuns)
    .set({
      highestStepSent: args.stepIndex,
      state: autopilot ? "running" : "awaiting_approval",
      escalateAfterBrokenPromise: false,
      nextSendOn: nextRungDate(args.subject.sequence.steps, invoice.dueAt, args.stepIndex),
      updatedAt: new Date(),
    })
    .where(eq(sequenceRuns.id, run.id));

  if (!autopilot) {
    await audit(firm.id, SYSTEM, "sequence_queued", `${invoice.number} → ${client.name}`, {
      invoiceId: invoice.id,
      stepIndex: args.stepIndex,
      level: prepared.escalationLevel,
    });
    return { outcome: "queued", message };
  }

  const result = await deliver(message, args.subject, prepared, args.actor ?? SYSTEM);
  return { outcome: "sent", message: result.message, delivered: result.delivered, error: result.error };
}

async function deliver(
  message: Message,
  subject: RunSubject,
  prepared: Pick<PreparedSend, "subject" | "text" | "html" | "toEmails">,
  actor: string,
): Promise<{ message: Message; delivered: boolean; error?: string }> {
  const db = getDb();
  const { firm, invoice, client } = subject;

  const result = await sendMail({
    to: prepared.toEmails,
    subject: prepared.subject,
    text: prepared.text,
    html: prepared.html,
    replyTo: firm.replyToEmail ?? undefined,
    fromName: firm.name,
    senderDomain: firm.senderVerified ? firm.senderDomain : null,
  });

  const [updated] = await db
    .update(messages)
    .set({
      status: result.delivered ? "sent" : "failed",
      providerMessageId: result.messageId ?? null,
      error: result.error ?? null,
      sentAt: new Date(),
    })
    .where(eq(messages.id, message.id))
    .returning();

  await audit(
    firm.id,
    actor,
    "sequence_sent",
    `${invoice.number} → ${client.name} · step ${message.stepIndex + 1}`,
    {
      invoiceId: invoice.id,
      stepIndex: message.stepIndex,
      delivered: result.delivered,
      error: result.error ?? null,
    },
  );

  return { message: updated, delivered: result.delivered, error: result.error };
}

/* --------------------------------------------------------------- approvals --- */

export interface ApprovalItem {
  message: Message;
  invoice: Invoice;
  client: Client;
  daysLate: number;
}

export async function pendingApprovals(firmId: string): Promise<ApprovalItem[]> {
  const db = getDb();
  const asOf = today();
  const rows = await db
    .select({ message: messages, invoice: invoices, client: clients })
    .from(messages)
    .innerJoin(invoices, eq(invoices.id, messages.invoiceId))
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(messages.firmId, firmId), eq(messages.status, "awaiting_approval")))
    .orderBy(desc(messages.escalationLevel), asc(invoices.dueAt));
  return rows.map((row) => ({ ...row, daysLate: daysOverdue(row.invoice.dueAt, asOf) }));
}

export async function pendingApprovalCount(firmId: string): Promise<number> {
  return (await pendingApprovals(firmId)).length;
}

export type ApproveResult =
  | { ok: true; delivered: boolean; error?: string }
  | { ok: false; reason: "not_found" | "already_handled" | "settled" };

/**
 * Approve a queued send.
 *
 * The balance is re-read here, at the moment of the tap, not trusted from when
 * the row was queued. A client who paid overnight must not be chased because a
 * firm approved a tray that was built yesterday — the send is dropped and the
 * run completed instead.
 */
export async function approveMessage(
  firmId: string,
  messageId: string,
  userId: string,
): Promise<ApproveResult> {
  const db = getDb();
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.firmId, firmId), eq(messages.id, messageId)));
  if (!message) return { ok: false, reason: "not_found" };
  if (message.status !== "awaiting_approval") return { ok: false, reason: "already_handled" };

  const subject = await loadRunSubject(firmId, message.invoiceId);
  if (!subject) return { ok: false, reason: "not_found" };

  if (subject.invoice.balanceCents <= 0 || subject.invoice.status === "paid") {
    await db
      .update(messages)
      .set({ status: "declined", error: "Invoice was settled before approval" })
      .where(eq(messages.id, message.id));
    await stopRun(message.invoiceId, "paid");
    return { ok: false, reason: "settled" };
  }

  await db
    .update(messages)
    .set({ approvedByUserId: userId, approvedAt: new Date(), status: "queued" })
    .where(eq(messages.id, message.id));
  await db
    .update(sequenceRuns)
    .set({ state: "running", updatedAt: new Date() })
    .where(eq(sequenceRuns.id, message.sequenceRunId));

  await audit(firmId, userId, "sequence_approved", `${subject.invoice.number} · step ${message.stepIndex + 1}`, {
    invoiceId: message.invoiceId,
  });

  const result = await deliver(
    message,
    subject,
    {
      subject: message.subject,
      text: message.bodySnapshot,
      html: rehydrateHtml(subject, message),
      toEmails: message.toEmails,
    },
    userId,
  );
  return { ok: true, delivered: result.delivered, error: result.error };
}

/**
 * Rebuild the HTML wrapper around the approved snapshot. The snapshot is the
 * source of truth for the *words* — what a human read and approved — and the
 * wrapper is presentation.
 */
function rehydrateHtml(subject: RunSubject, message: Message): string {
  const { firm, invoice } = subject;
  return renderStep({
    tone: subject.sequence.tone,
    level: message.escalationLevel as EscalationLevel,
    overrideSubject: message.subject,
    overrideBody: message.bodySnapshot,
    ctx: {
      contactFirstName: firstName(subject.client.contactName, "there"),
      clientName: subject.client.name,
      firmName: firm.name,
      invoiceNumber: invoice.number,
      amount: formatMoney(invoice.balanceCents, invoice.currency),
      dueDate: formatLongDate(invoice.dueAt),
      daysOverdue: daysOverdue(invoice.dueAt, today()),
      daysUntilDue: Math.max(0, -daysFromDue(invoice.dueAt, today())),
      portalUrl: portalUrl(message.portalToken ?? ""),
      signature: firmSettings(firm).signature || firm.name,
    },
  }).html;
}

export async function declineMessage(
  firmId: string,
  messageId: string,
  userId: string,
): Promise<boolean> {
  const db = getDb();
  const [message] = await db
    .update(messages)
    .set({ status: "declined", error: "Declined by the firm" })
    .where(
      and(
        eq(messages.firmId, firmId),
        eq(messages.id, messageId),
        eq(messages.status, "awaiting_approval"),
      ),
    )
    .returning();
  if (!message) return false;
  await audit(firmId, userId, "sequence_declined", `step ${message.stepIndex + 1}`, {
    invoiceId: message.invoiceId,
  });
  return true;
}

export async function approveAll(
  firmId: string,
  userId: string,
): Promise<{ approved: number; delivered: number; skipped: number }> {
  const pending = await pendingApprovals(firmId);
  let approved = 0;
  let delivered = 0;
  let skipped = 0;
  for (const item of pending) {
    const result = await approveMessage(firmId, item.message.id, userId);
    if (result.ok) {
      approved += 1;
      if (result.delivered) delivered += 1;
    } else {
      skipped += 1;
    }
  }
  return { approved, delivered, skipped };
}

/* ------------------------------------------------------------- manual send --- */

export type ManualSendResult =
  | { ok: true; outcome: CommitOutcome }
  | { ok: false; reason: string };

/**
 * "Send the next step now" from the invoice screen. Uses the same ladder
 * decision as the sweep — a human can bring a rung forward, but cannot invent a
 * fifth rung or re-send one that has already gone.
 */
export async function sendNextStepNow(
  firmId: string,
  invoiceId: string,
  userId: string,
): Promise<ManualSendResult> {
  const subject = await loadRunSubject(firmId, invoiceId);
  if (!subject) return { ok: false, reason: "Invoice not found" };

  const asOf = today();
  const decision = decideNextRung(ladderContextFor(subject, asOf));

  // A person tapping "send now" overrides the *calendar* only. Every safety
  // check — paid, disputed, written off, VIP, paused, ladder finished — still
  // refuses, and the step they get is the next one in order, never a jump to the
  // final notice.
  let stepIndex: number;
  let step: SequenceStep;
  let promiseAware: boolean;
  if (decision.action === "send") {
    ({ stepIndex, step, promiseAware } = decision);
  } else if (
    decision.reason === "waiting_for_next_rung" ||
    decision.reason === "before_first_rung"
  ) {
    const ladder = normalizeLadder(subject.sequence.steps);
    stepIndex = subject.run.highestStepSent + 1;
    if (stepIndex >= ladder.length) {
      return { ok: false, reason: holdExplanation("ladder_complete") };
    }
    step = ladder[stepIndex];
    promiseAware = false;
  } else {
    return { ok: false, reason: holdExplanation(decision.reason) };
  }

  const [openPromise] = await getDb()
    .select()
    .from(promises)
    .where(and(eq(promises.invoiceId, invoiceId), eq(promises.status, "open")))
    .limit(1);

  const outcome = await commitRung({
    subject,
    stepIndex,
    step,
    promiseAware,
    asOf,
    promisedFor: openPromise?.promisedFor ?? null,
    forceSend: true,
    actor: userId,
  });
  return { ok: true, outcome };
}

export function holdExplanation(reason: string): string {
  const map: Record<string, string> = {
    firm_paused: "All follow-up is paused for this firm.",
    settled: "This invoice is settled — nothing will be sent.",
    written_off: "This invoice is written off.",
    disputed: "This invoice is disputed; follow-up is stopped until you resolve it.",
    vip: "This client is marked VIP, so PaidWell never chases them automatically.",
    stopped: "This sequence has been stopped.",
    paused_reply: "The client replied — resume the sequence to continue.",
    open_promise: "There is an open promise to pay; the sequence resumes if it is missed.",
    before_first_rung: "The first step is not due yet.",
    waiting_for_next_rung: "The next step is not due yet.",
    ladder_complete: "Every step in the ladder has been sent. This one needs a person.",
  };
  return map[reason] ?? "No step is due.";
}
