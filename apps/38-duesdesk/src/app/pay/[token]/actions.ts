"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { associations, invoices, members } from "@/db/schema";
import { audit } from "@/lib/audit";
import { loadInvoice } from "@/lib/invoicing";
import { setSmsOptIn, sendEmail } from "@/lib/notify";
import {
  mintStepUpToken,
  stepUpUrl,
  verifyPortalToken,
  verifyStepUpToken,
} from "@/lib/portal";
import { createAutopaySetupSession, createDuesCheckout, stripeConfigured } from "@/lib/stripe";
import { createIssue } from "@/lib/issues";
import { storePhotos } from "@/app/(dashboard)/issues/actions";
import type { IssueKind } from "@/db/schema";

export interface PortalState {
  error?: string;
  ok?: string;
}

/** Every action here re-verifies the token. A portal action never trusts a form. */
async function session(token: string) {
  const result = await verifyPortalToken(token);
  if (!result.ok) throw new Error("This link is no longer valid. Ask the board for a new one.");
  const [association] = await getDb()
    .select()
    .from(associations)
    .where(eq(associations.id, result.session.household.associationId));
  if (!association) throw new Error("This association is no longer on DuesDesk.");
  return { ...result.session, association };
}

export async function payInvoiceAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const { household, member, association } = await session(token);

  const ledger = await loadInvoice(invoiceId);
  if (!ledger || ledger.invoice.householdId !== household.id) {
    throw new Error("That invoice is not on this household's account.");
  }
  if (ledger.dueNowCents <= 0) {
    throw new Error("There is nothing left to pay on that invoice.");
  }
  if (!stripeConfigured() || !association.stripeAccountId) {
    throw new Error(
      "This association has not finished connecting its bank details yet. Contact the board — a check still works.",
    );
  }

  const url = await createDuesCheckout({
    association,
    invoice: ledger.invoice,
    amountCents: ledger.dueNowCents,
    unitLabel: household.unitLabel,
    portalToken: token,
    memberEmail: member.email,
  });
  await audit(
    association.id,
    { kind: "member", id: member.id, name: member.name },
    "started_checkout",
    `invoice ${ledger.invoice.periodLabel}`,
    { invoiceId, amountCents: ledger.dueNowCents },
  );
  redirect(url);
}

/**
 * Step one of autopay: email the household a short-lived link that proves inbox
 * control. A forwarded portal link must never be enough to attach a bank account
 * to a household.
 */
export async function requestStepUpAction(
  _prev: PortalState,
  formData: FormData,
): Promise<PortalState> {
  try {
    const token = String(formData.get("token") ?? "");
    const { member, association } = await session(token);
    if (!member.email) {
      return {
        error:
          "There is no email address on file for you, so we cannot confirm it is you. Ask the board to add one first.",
      };
    }

    const stepUp = await mintStepUpToken(member.id);
    const link = stepUpUrl(token, stepUp);
    await sendEmail(
      { associationId: association.id, memberId: member.id, purpose: "autopay_stepup" },
      {
        to: member.email,
        subject: `Confirm it is you before setting up autopay for ${association.name}`,
        text:
          `Hello ${member.name},\n\n` +
          `Someone asked to set up automatic dues payments for your household. If that was you, ` +
          `open this link within 15 minutes and you can save a bank account or card:\n\n${link}\n\n` +
          `If it was not you, ignore this email — nothing has been saved, and the link expires by itself. ` +
          `We ask for this one extra step because a payment link can be forwarded, and a saved bank ` +
          `account should need more than that.`,
      },
    );

    await audit(
      association.id,
      { kind: "member", id: member.id, name: member.name },
      "requested_autopay_stepup",
      member.email,
    );
    return {
      ok: `Check ${member.email}. The link is good for 15 minutes.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send that email" };
  }
}

/**
 * Step two: with a valid step-up token, open Stripe's hosted setup page.
 *
 * This is the gate ROADMAP's acceptance criteria require a test to prove: the
 * step-up token is verified here, server-side, for this exact member. A forwarded
 * portal link cannot reach Stripe.
 */
export async function beginAutopayAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const step = String(formData.get("step") ?? "");
  const { household, member, association } = await session(token);

  if (!(await verifyStepUpToken(step, member.id))) {
    throw new Error(
      "That confirmation link has expired or was meant for someone else. Ask for a fresh one.",
    );
  }
  if (!stripeConfigured() || !association.stripeAccountId) {
    throw new Error(
      "This association has not finished connecting its bank details, so autopay cannot be set up yet.",
    );
  }

  const url = await createAutopaySetupSession({
    association,
    householdId: household.id,
    unitLabel: household.unitLabel,
    email: member.email,
    memberId: member.id,
    portalToken: token,
  });
  await audit(
    association.id,
    { kind: "member", id: member.id, name: member.name },
    "began_autopay_setup",
    `unit ${household.unitLabel}`,
  );
  redirect(url);
}

export async function fileRequestAction(
  _prev: PortalState,
  formData: FormData,
): Promise<PortalState> {
  try {
    const token = String(formData.get("token") ?? "");
    const { household, member, association } = await session(token);
    const kind = String(formData.get("kind") ?? "maintenance") as IssueKind;
    if (!["maintenance", "architectural"].includes(kind)) {
      return { error: "Pick whether this is a maintenance or an architectural request" };
    }
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return { error: "Give your request a short title" };

    const issue = await createIssue(
      {
        associationId: association.id,
        householdId: household.id,
        kind,
        title,
        body: String(formData.get("body") ?? ""),
        visibility: "member_visible",
      },
      { kind: "member", id: member.id, name: member.name },
    );

    const files = formData.getAll("photos").filter((f): f is File => f instanceof File);
    const { keys, rejected } = await storePhotos(association.id, issue.id, files);
    if (keys.length > 0) {
      const { appendEvent } = await import("@/lib/issues");
      await appendEvent(
        issue.id,
        { body: `${keys.length} photo${keys.length === 1 ? "" : "s"} attached.`, visibility: "member_visible", photoKeys: keys },
        { kind: "member", id: member.id, name: member.name },
      );
    }

    revalidatePath(`/pay/${token}`);
    return {
      ok: `Filed as ${issue.number}. You can follow it on this page, and the board sees it now.${
        rejected.length ? ` Not attached: ${rejected.join("; ")}.` : ""
      }`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not file that request" };
  }
}

export async function setSmsPreferenceAction(
  _prev: PortalState,
  formData: FormData,
): Promise<PortalState> {
  try {
    const token = String(formData.get("token") ?? "");
    const { member, association } = await session(token);
    const optIn = formData.get("optIn") === "on";
    if (optIn && !member.phone) {
      return { error: "There is no mobile number on file for you. Ask the board to add one." };
    }
    await setSmsOptIn(member.id, optIn);
    await audit(
      association.id,
      { kind: "member", id: member.id, name: member.name },
      optIn ? "sms_opt_in" : "sms_opt_out",
      member.phone ?? "no number",
    );
    revalidatePath(`/pay/${token}`);
    return {
      ok: optIn
        ? "Texts are on. Reply STOP to any message and they stop immediately."
        : "Texts are off. You will still get everything by email.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that preference" };
  }
}

/** A member asking for a fresh link when theirs has expired. */
export async function requestNewLinkAction(
  _prev: PortalState,
  formData: FormData,
): Promise<PortalState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter the email address the board has for you" };

  const db = getDb();
  const [member] = await db.select().from(members).where(eq(members.email, email));
  // Same answer either way: never disclose whether an address is on a roster.
  if (member) {
    const { mintPortalToken, portalUrl } = await import("@/lib/portal");
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.householdId, member.householdId))
      .limit(1);
    const link = portalUrl(await mintPortalToken(member.id));
    const [association] = await db
      .select()
      .from(associations)
      .where(eq(associations.id, invoice?.associationId ?? ""));
    await sendEmail(
      {
        associationId: invoice?.associationId ?? "",
        memberId: member.id,
        purpose: "portal_link_resend",
      },
      {
        to: email,
        subject: `Your ${association?.name ?? "association"} payment link`,
        text:
          `Hello ${member.name},\n\nHere is a fresh link to your household's page — balance, ` +
          `invoices, autopay, and your requests:\n\n${link}\n\n` +
          `It replaces any earlier link, which no longer works.`,
      },
    );
  }
  return {
    ok: "If that address is on a DuesDesk roster, a new link is on its way to it.",
  };
}
