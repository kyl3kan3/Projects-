"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, documents, reminderRules } from "@/db/schema";
import { defaultBrand, requireUser } from "@/lib/auth";
import { parseDocForm } from "@/lib/doc-form";
import { canCreateDocument, plan } from "@/lib/plans";
import {
  createDocument,
  documentsCreatedThisMonth,
  loadBundle,
  logEvent,
  replaceBlocks,
  voidDocument,
} from "@/lib/documents";
import { issueBalanceInvoice } from "@/lib/chain";
import { loadInvoice, recordPayment } from "@/lib/invoices";
import { clearPaymentLink } from "@/lib/billing";
import { sendDocument, sendReminder } from "@/lib/delivery";
import { documentUrl } from "@/lib/delivery";
import { nextReminderStep, reminderCopy, reminderSteps } from "@/lib/reminders";
import { balanceDue, formatMoney, parseMoneyInput } from "@/lib/money";
import { daysOverdue } from "@/lib/dates";

export interface ActionState {
  error?: string;
  ok?: boolean;
  message?: string;
}

/* ------------------------------------------------------------- authoring --- */

/** Create (or update) the client record a document is addressed to. */
async function resolveClient(
  userId: string,
  input: { clientId: string | null; clientName: string; clientEmail: string; clientCompany: string },
): Promise<string> {
  const db = getDb();
  if (input.clientId) {
    const [existing] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.userId, userId)));
    if (existing) {
      await db
        .update(clients)
        .set({
          name: input.clientName,
          email: input.clientEmail,
          company: input.clientCompany || null,
        })
        .where(eq(clients.id, existing.id));
      return existing.id;
    }
  }
  const [match] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.userId, userId), eq(clients.email, input.clientEmail)));
  if (match) return match.id;

  const [created] = await db
    .insert(clients)
    .values({
      userId,
      name: input.clientName,
      email: input.clientEmail,
      company: input.clientCompany || null,
    })
    .returning();
  return created.id;
}

export async function createProposalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "That form could not be read — try again." };
  }
  const parsed = parseDocForm(payload);
  if (!parsed.ok || !parsed.value) return { error: parsed.error };

  const used = await documentsCreatedThisMonth(user.id);
  const gate = canCreateDocument(user.plan, used);
  if (!gate.allowed) return { error: gate.reason };

  const brand = await defaultBrand(user.id);
  const clientId = await resolveClient(user.id, parsed.value);

  const document = await createDocument({
    userId: user.id,
    brandId: brand.id,
    clientId,
    type: "proposal",
    title: parsed.value.title,
    currency: parsed.value.currency,
    taxRateBps: parsed.value.taxRateBps,
    taxLabel: parsed.value.taxLabel,
    depositPercent: parsed.value.depositPercent,
    netDays: parsed.value.netDays,
    blocks: parsed.value.blocks,
  });
  await logEvent(document.id, "created", "Proposal drafted", "you");

  revalidatePath("/documents");
  revalidatePath("/chain");
  redirect(`/documents/${document.id}`);
}

export async function updateDraftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "That form could not be read — try again." };
  }
  const parsed = parseDocForm(payload);
  if (!parsed.ok || !parsed.value) return { error: parsed.error };

  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, user.id)));
  if (!document) return { error: "That document is not on your account." };
  if (document.status !== "draft") {
    return { error: "This document has been sent — void it and reissue to change the terms." };
  }

  const clientId = await resolveClient(user.id, parsed.value);
  await db
    .update(documents)
    .set({
      title: parsed.value.title,
      clientId,
      currency: parsed.value.currency,
      taxRateBps: parsed.value.taxRateBps,
      taxLabel: parsed.value.taxLabel,
      depositPercent: parsed.value.depositPercent,
      netDays: parsed.value.netDays,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
  await replaceBlocks(documentId, parsed.value.blocks);

  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${documentId}`);
}

/* ---------------------------------------------------------------- sending --- */

export async function sendDocumentAction(documentId: string): Promise<ActionState> {
  const user = await requireUser();
  const bundle = await loadBundle(documentId);
  if (!bundle || bundle.document.userId !== user.id) return { error: "Not found" };

  const db = getDb();
  const brand = bundle.brand ?? (await defaultBrand(user.id));
  let invoice = bundle.invoice;

  try {
    // Issue first: the covering note quotes the due date, and an invoice with no
    // due date has no payment terms to quote.
    if (bundle.document.type === "invoice" && invoice && !invoice.issuedAt) {
      const { issueDraftInvoice } = await import("@/lib/invoices");
      invoice = (await issueDraftInvoice(bundle.document)) ?? invoice;
    }

    const result = await sendDocument({
      document: bundle.document,
      client: bundle.client,
      brand,
      freelancerName: user.name?.trim() || user.email,
      freelancerEmail: user.email,
      planId: user.plan,
      total: invoice?.total ?? bundle.totals.total,
      invoiceNumber: invoice?.number ?? null,
      dueAt: invoice?.dueAt ?? null,
    });

    if (!bundle.document.brandId) {
      await db.update(documents).set({ brandId: brand.id }).where(eq(documents.id, documentId));
    }

    revalidatePath(`/documents/${documentId}`);
    revalidatePath("/chain");
    revalidatePath("/documents");
    return result.delivered
      ? { ok: true, message: `Sent to ${bundle.client.email}.` }
      : {
          ok: true,
          message: `Link is live — email not sent (${result.error ?? "no provider configured"}). Copy the link and send it yourself.`,
        };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send that document" };
  }
}

export async function voidDocumentAction(documentId: string): Promise<ActionState> {
  const user = await requireUser();
  const bundle = await loadBundle(documentId);
  if (!bundle || bundle.document.userId !== user.id) return { error: "Not found" };

  const done = await voidDocument(bundle.document, "Voided by you");
  if (!done) return { error: "A paid document cannot be voided — it is the payment record." };
  await clearPaymentLink(documentId).catch(() => {});

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/chain");
  revalidatePath("/documents");
  revalidatePath("/income");
  return { ok: true, message: "Voided. The client's link now says so." };
}

/* --------------------------------------------------------------- invoicing --- */

export async function issueBalanceAction(contractId: string): Promise<ActionState> {
  const user = await requireUser();
  const bundle = await loadBundle(contractId);
  if (!bundle || bundle.document.userId !== user.id) return { error: "Not found" };

  const result = await issueBalanceInvoice(bundle.document);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/documents/${contractId}`);
  revalidatePath("/chain");
  revalidatePath("/income");
  return { ok: true, message: "Final invoice raised and sent." };
}

export async function recordManualPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  const bundle = await loadBundle(documentId);
  if (!bundle || bundle.document.userId !== user.id) return { error: "Not found" };
  const invoice = bundle.invoice;
  if (!invoice) return { error: "That document is not an invoice." };

  const amount = parseMoneyInput(String(formData.get("amount") ?? ""), invoice.currency);
  if (amount === null || amount <= 0) return { error: "Enter the amount received, like 1440" };
  const outstanding = balanceDue(invoice);
  if (amount > outstanding) {
    return {
      error: `That is more than the ${formatMoney(outstanding, invoice.currency)} outstanding on this invoice.`,
    };
  }

  await recordPayment({
    invoiceDocumentId: documentId,
    amount,
    method: "bank_transfer",
    note: String(formData.get("note") ?? "").slice(0, 200) || "Recorded by you",
  });
  await clearPaymentLink(documentId);

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/chain");
  revalidatePath("/income");
  return { ok: true, message: "Payment recorded." };
}

/* --------------------------------------------------------------- reminders --- */

/**
 * Send the next reminder in the sequence now, without waiting for the sweep.
 * Uses exactly the same decision function, so a manual nudge cannot get the
 * sequence out of step.
 */
export async function remindNowAction(documentId: string): Promise<ActionState> {
  const user = await requireUser();
  const bundle = await loadBundle(documentId);
  if (!bundle || bundle.document.userId !== user.id) return { error: "Not found" };
  const invoice = bundle.invoice ?? (await loadInvoice(documentId));
  if (!invoice) return { error: "Only an invoice can be chased." };
  if (balanceDue(invoice) <= 0) return { error: "This invoice is settled." };

  const db = getDb();
  const rule = (await db.select().from(reminderRules).where(eq(reminderRules.userId, user.id)))[0] ?? {
    userId: user.id,
    enabled: true,
    step1Days: 1,
    step2Days: 7,
    step3Days: 14,
    ccOwnerOnFinal: true,
    updatedAt: new Date(),
  };
  const { reminderSends } = await import("@/db/schema");
  const sent = await db
    .select()
    .from(reminderSends)
    .where(eq(reminderSends.documentId, documentId));

  const now = new Date();
  const step =
    nextReminderStep({ ...rule, enabled: true }, { ...invoice, status: bundle.document.status }, sent.map((s) => s.step), now) ??
    // Nothing is due by the cadence: send the next unsent notice anyway, since
    // the freelancer asked for it explicitly.
    reminderSteps(rule).find((s) => !sent.some((row) => row.step === s.step)) ??
    null;
  if (!step) return { error: "All three notices have already gone out." };

  const brand = bundle.brand ?? (await defaultBrand(user.id));
  const copy = reminderCopy(step.tone, {
    clientName: bundle.client.name,
    freelancerName: user.name?.trim() || user.email,
    invoiceNumber: invoice.number,
    documentTitle: bundle.document.title,
    balance: balanceDue(invoice),
    currency: invoice.currency,
    daysLate: Math.max(1, daysOverdue(invoice.dueAt, now)),
    link: documentUrl(bundle.document.publicToken),
  });

  const result = await sendReminder({
    documentId,
    step: step.step,
    to: bundle.client.email,
    cc: step.tone === "final" && rule.ccOwnerOnFinal ? [user.email] : undefined,
    subject: copy.subject,
    body: copy.body,
    replyTo: user.email,
    fromName: brand.name,
    senderDomain:
      plan(user.plan).senderDomain && brand.senderDomainVerified ? brand.senderDomain : null,
  });

  revalidatePath(`/documents/${documentId}`);
  return result.delivered
    ? { ok: true, message: `${step.tone === "gentle" ? "Gentle" : step.tone === "firm" ? "Firm" : "Final"} notice sent.` }
    : { ok: true, message: `Notice logged but not emailed (${result.error ?? "no provider"}).` };
}

/** Used by the detail screen's "duplicate" action: a fresh draft, same terms. */
export async function duplicateDocumentAction(documentId: string): Promise<ActionState> {
  const user = await requireUser();
  const bundle = await loadBundle(documentId);
  if (!bundle || bundle.document.userId !== user.id) return { error: "Not found" };

  const used = await documentsCreatedThisMonth(user.id);
  const gate = canCreateDocument(user.plan, used);
  if (!gate.allowed) return { error: gate.reason };

  const blocks = bundle.blocks.map((b) => ({
    kind: b.kind,
    position: b.position,
    content: b.content,
  }));
  const title = `${bundle.document.title} (copy)`;

  // An invoice copy needs its own number and totals, so it goes through the
  // invoice issuer rather than the plain document create.
  if (bundle.document.type === "invoice") {
    const { issueInvoice } = await import("@/lib/invoices");
    const issued = await issueInvoice({
      userId: user.id,
      brandId: bundle.document.brandId,
      clientId: bundle.document.clientId,
      title,
      currency: bundle.document.currency,
      taxRateBps: bundle.document.taxRateBps,
      taxLabel: bundle.document.taxLabel,
      netDays: bundle.document.netDays,
      depositPercent: bundle.document.depositPercent,
      kind: "standalone",
      subtotal: bundle.invoice?.subtotal ?? bundle.totals.subtotal,
      tax: bundle.invoice?.tax ?? bundle.totals.tax,
      total: bundle.invoice?.total ?? bundle.totals.total,
      parentDocumentId: null,
      blocks,
      issuedAt: null,
    });
    revalidatePath("/documents");
    redirect(`/documents/${issued.document.id}`);
  }

  const copy = await createDocument({
    userId: user.id,
    brandId: bundle.document.brandId,
    clientId: bundle.document.clientId,
    type: "proposal",
    title,
    currency: bundle.document.currency,
    taxRateBps: bundle.document.taxRateBps,
    taxLabel: bundle.document.taxLabel,
    depositPercent: bundle.document.depositPercent,
    netDays: bundle.document.netDays,
    blocks,
  });
  await logEvent(copy.id, "created", `Duplicated from ${bundle.document.title}`, "you");
  revalidatePath("/documents");
  redirect(`/documents/${copy.id}`);
}
