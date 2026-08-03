"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { deals, parties, tasks, type ContractType, type DealStatus, type PartyRole, type TaskStatus } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { actorLabel, requireSession } from "@/lib/auth";
import { commissionSchema, parseMoneyToCents, parseRateToBps } from "@/lib/commissions";
import { isIsoDate, type Anchors } from "@/lib/dates";
import {
  addNote,
  applyAnchorChange,
  countOpenDeals,
  openDeal,
  previewAnchorChange,
  setDateStatus,
  setDealStatus,
  setTaskStatus,
  updateCommission,
  type AnchorPreview,
} from "@/lib/deals";
import { uploadDocument } from "@/lib/documents";
import { canOpenDeal, canUsePartyPortal, isReadOnly } from "@/lib/plans";
import { partyTokenHash, portalUrlForParty } from "@/lib/tokens";

/* ------------------------------------------------------------------ helpers */

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalDate(form: FormData, key: string): string | null {
  const value = text(form, key);
  return isIsoDate(value) ? value : null;
}

export interface FormState {
  error: string | null;
  ok?: string | null;
  /**
   * The values just submitted, echoed back.
   *
   * React 19 resets an uncontrolled form once its action returns, so a single
   * unreadable price used to wipe an entire new-file form — address, dates,
   * seven parties and all. Feeding these into `defaultValue` makes the reset
   * restore what the coordinator wrote.
   */
  values?: Record<string, string>;
}

const OK: FormState = { error: null, ok: null };

/* ---------------------------------------------------------------- open a deal */

export async function openDealAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  // Everything typed, so a rejected submit gives it all back.
  const typed: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") typed[key] = value;
  }
  const reject = (error: string): FormState => ({ error, values: typed });

  const gate = canOpenDeal(account, await countOpenDeals(account.id));
  if (!gate.allowed) return reject(gate.reason);

  const address = text(form, "address");
  if (!address) return reject("Enter the property address.");
  const templateId = text(form, "templateId");
  if (!templateId) return reject("Pick a checklist template.");
  const contractType = text(form, "contractType") as ContractType;

  const priceRaw = text(form, "price");
  const priceCents = priceRaw ? parseMoneyToCents(priceRaw) : null;
  if (priceRaw && priceCents === null) {
    return reject("That sale price could not be read. Try 438,000.");
  }
  const rateRaw = text(form, "rate");
  const rateBps = rateRaw ? parseRateToBps(rateRaw) : 0;
  if (rateRaw && rateBps === null) {
    return reject("That commission rate could not be read. Try 2.5.");
  }
  const tcFee = text(form, "tcFee") ? parseMoneyToCents(text(form, "tcFee")) : 0;
  if (text(form, "tcFee") && tcFee === null) {
    return reject("That coordination fee could not be read. Try 450.");
  }

  const contractDate = optionalDate(form, "contractDate");
  const closingDate = optionalDate(form, "closingDate");
  if (contractDate && closingDate && closingDate < contractDate) {
    return reject("The closing date cannot be before the contract date.");
  }

  const partyRoles: PartyRole[] = ["buyer", "seller", "buyer_agent", "listing_agent", "lender", "title", "tc"];
  const partyInputs = partyRoles
    .map((role) => ({
      role,
      name: text(form, `party_${role}_name`),
      email: text(form, `party_${role}_email`) || null,
    }))
    .filter((p) => p.name.length > 0);

  let dealId: string;
  try {
    const result = await openDeal(
      {
        accountId: account.id,
        address,
        mlsNumber: text(form, "mlsNumber") || null,
        contractType,
        templateId,
        priceCents,
        contractDate,
        acceptanceDate: optionalDate(form, "acceptanceDate") ?? contractDate,
        closingDate,
        commission: {
          rateBps: rateBps ?? 0,
          split: [],
          referralFeeCents: 0,
          tcFeeCents: tcFee ?? 0,
        },
        parties: partyInputs,
      },
      actorLabel(user),
      account.state,
    );
    dealId = result.dealId;
  } catch (err) {
    return reject(err instanceof Error ? err.message : "Could not open the file");
  }

  revalidatePath("/deals");
  redirect(`/deals/${dealId}?opened=1`);
}

/* ------------------------------------------------------- the recompute flow */

export interface PreviewState {
  error: string | null;
  preview: AnchorPreview | null;
  proposed: { contract_date: string | null; acceptance_date: string | null; closing_date: string | null } | null;
  /** The raw date-input values, so a rejected preview keeps them on screen. */
  values?: Record<string, string>;
}

function anchorsFromForm(form: FormData): Anchors {
  return {
    contract_date: optionalDate(form, "contractDate"),
    acceptance_date: optionalDate(form, "acceptanceDate"),
    closing_date: optionalDate(form, "closingDate"),
  };
}

/**
 * Step one of the only way anchors change: compute the diff and hand it back.
 * Nothing is written. DESIGN.md and BUILD.md are both explicit — an anchor edit
 * ALWAYS previews before it applies.
 */
export async function previewAnchorsAction(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const { account } = await requireSession();
  const dealId = text(form, "dealId");
  const proposed = anchorsFromForm(form);
  const typed = {
    contractDate: text(form, "contractDate"),
    acceptanceDate: text(form, "acceptanceDate"),
    closingDate: text(form, "closingDate"),
  };
  if (proposed.contract_date && proposed.closing_date && proposed.closing_date < proposed.contract_date) {
    return {
      error: "The closing date cannot be before the contract date.",
      preview: null,
      proposed: null,
      values: typed,
    };
  }
  const preview = await previewAnchorChange(
    dealId,
    account.id,
    proposed,
    account.state,
    account.timezone,
    account.settings,
  );
  if (!preview) {
    return { error: "That file is not on your desk.", preview: null, proposed: null, values: typed };
  }
  if (preview.changed.length === 0) {
    return {
      error: "Nothing changed — those are the dates already on the file.",
      preview: null,
      proposed: null,
      values: typed,
    };
  }
  return {
    error: null,
    values: typed,
    preview,
    proposed: {
      contract_date: proposed.contract_date ?? null,
      acceptance_date: proposed.acceptance_date ?? null,
      closing_date: proposed.closing_date ?? null,
    },
  };
}

/** Step two: write the values the coordinator just read. */
export async function applyAnchorsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  if (isReadOnly(account)) return { error: "The desk is read-only until you choose a plan." };
  const dealId = text(form, "dealId");
  const result = await applyAnchorChange(
    dealId,
    account.id,
    anchorsFromForm(form),
    user.id,
    actorLabel(user),
    account.state,
    account.timezone,
    account.settings,
  );
  if (!result) return { error: "That file is not on your desk." };
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  return {
    error: null,
    ok: `Applied — ${result.moved} ${result.moved === 1 ? "date" : "dates"} moved${
      result.created ? `, ${result.created} added` : ""
    }${result.removed ? `, ${result.removed} now need a date` : ""}.`,
  };
}

/* ------------------------------------------------------------ small updates */

export async function setTaskStatusAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  if (isReadOnly(account)) return { error: "The desk is read-only until you choose a plan." };
  const dealId = text(form, "dealId");
  const done = await setTaskStatus(
    dealId,
    account.id,
    text(form, "taskId"),
    text(form, "status") as TaskStatus,
    user.id,
    actorLabel(user),
  );
  if (!done) return { error: "That task is not on this file." };
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  return OK;
}

export async function setDateStatusAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  if (isReadOnly(account)) return { error: "The desk is read-only until you choose a plan." };
  const dealId = text(form, "dealId");
  const status = text(form, "status") as "met" | "waived" | "upcoming";
  const done = await setDateStatus(dealId, account.id, text(form, "dateId"), status, actorLabel(user));
  if (!done) return { error: "That date is not on this file." };
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  return OK;
}

export async function setDealStatusAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  if (isReadOnly(account)) return { error: "The desk is read-only until you choose a plan." };
  const dealId = text(form, "dealId");
  const done = await setDealStatus(dealId, account.id, text(form, "status") as DealStatus, actorLabel(user));
  if (!done) return { error: "That file is not on your desk." };
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/commissions");
  return OK;
}

export async function updateCommissionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  const typed: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") typed[key] = value;
  }
  const reject = (error: string): FormState => ({ error, values: typed });
  if (isReadOnly(account)) return reject("The desk is read-only until you choose a plan.");
  const dealId = text(form, "dealId");

  const priceRaw = text(form, "price");
  const priceCents = priceRaw ? parseMoneyToCents(priceRaw) : null;
  if (priceRaw && priceCents === null) return reject("That sale price could not be read. Try 438,000.");

  const rateBps = parseRateToBps(text(form, "rate") || "0");
  if (rateBps === null) return reject("That commission rate could not be read. Try 2.5.");

  const referral = text(form, "referralFee") ? parseMoneyToCents(text(form, "referralFee")) : 0;
  if (text(form, "referralFee") && referral === null) return reject("That referral fee could not be read.");
  const tcFee = text(form, "tcFee") ? parseMoneyToCents(text(form, "tcFee")) : 0;
  if (text(form, "tcFee") && tcFee === null) return reject("That coordination fee could not be read.");

  const split: Array<{ label: string; bps: number }> = [];
  for (let i = 0; i < 4; i += 1) {
    const label = text(form, `splitLabel${i}`);
    const share = text(form, `splitShare${i}`);
    if (!label || !share) continue;
    const bps = parseRateToBps(share);
    // A split share is a percentage of the post-fee commission, so it can be 70.
    const asBps = bps === null ? Math.round(Number(share) * 100) : bps;
    if (!Number.isFinite(asBps) || asBps < 0 || asBps > 10_000) {
      return reject(`"${label}" needs a share between 0 and 100.`);
    }
    split.push({ label, bps: asBps });
  }
  const total = split.reduce((sum, s) => sum + s.bps, 0);
  if (total > 10_000) return reject("The named shares add up to more than 100%.");

  const parsed = commissionSchema.safeParse({
    rateBps,
    split,
    referralFeeCents: referral ?? 0,
    tcFeeCents: tcFee ?? 0,
  });
  if (!parsed.success) return reject("Those commission numbers did not add up. Check the rate.");

  const done = await updateCommission(dealId, account.id, priceCents, parsed.data, actorLabel(user));
  if (!done) return reject("That file is not on your desk.");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/commissions");
  return { error: null, ok: "Commission updated." };
}

export async function addNoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  if (isReadOnly(account)) return { error: "The desk is read-only until you choose a plan." };
  const dealId = text(form, "dealId");
  const body = text(form, "body");
  if (!body) return { error: "Write something first.", values: { body } };
  const done = await addNote(dealId, account.id, body, actorLabel(user));
  if (!done) return { error: "That file is not on your desk.", values: { body } };
  revalidatePath(`/deals/${dealId}`);
  return { error: null, ok: "Note added." };
}

/* ------------------------------------------------------------------ parties */

export async function savePartyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  if (isReadOnly(account)) return { error: "The desk is read-only until you choose a plan." };
  const db = getDb();
  const dealId = text(form, "dealId");
  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.accountId, account.id)));
  if (!deal) return { error: "That file is not on your desk." };

  const partyId = text(form, "partyId");
  const name = text(form, "name");
  const typed = {
    name,
    email: text(form, "email"),
    phone: text(form, "phone"),
    role: text(form, "role"),
  };
  if (!name) return { error: "A party needs a name.", values: typed };
  const email = text(form, "email") || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email does not look right.", values: typed };
  }
  const role = text(form, "role") as PartyRole;
  const notify = form.get("notify") === "on";

  if (partyId) {
    await db
      .update(parties)
      .set({ name, email, phone: text(form, "phone") || null, role, notify, updatedAt: new Date() })
      .where(and(eq(parties.id, partyId), eq(parties.dealId, dealId)));
  } else {
    await db.insert(parties).values({
      dealId,
      role,
      name,
      email,
      phone: text(form, "phone") || null,
      notify,
    });
  }
  await logActivity({
    dealId,
    actor: actorLabel(user),
    action: "parties_updated",
    target: name,
    metadata: { detail: `${name} — reminders ${notify ? "on" : "off"}` },
  });
  revalidatePath(`/deals/${dealId}`);
  return { error: null, ok: `${name} saved.` };
}

export async function issuePortalLinkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  const gate = canUsePartyPortal(account);
  if (!gate.allowed) return { error: gate.reason };
  const db = getDb();
  const dealId = text(form, "dealId");
  const partyId = text(form, "partyId");
  const [party] = await db
    .select({ id: parties.id, name: parties.name })
    .from(parties)
    .innerJoin(deals, eq(deals.id, parties.dealId))
    .where(and(eq(parties.id, partyId), eq(parties.dealId, dealId), eq(deals.accountId, account.id)));
  if (!party) return { error: "That party is not on this file." };

  const revoke = text(form, "revoke") === "1";
  await db
    .update(parties)
    .set({ portalTokenHash: revoke ? null : partyTokenHash(partyId), updatedAt: new Date() })
    .where(eq(parties.id, partyId));
  await logActivity({
    dealId,
    actor: actorLabel(user),
    action: revoke ? "portal_link_revoked" : "portal_link_created",
    target: party.name,
  });
  revalidatePath(`/deals/${dealId}`);
  return {
    error: null,
    ok: revoke ? `${party.name}'s link no longer works.` : `Link ready: ${portalUrlForParty(partyId)}`,
  };
}

/* ---------------------------------------------------------------- documents */

export async function uploadDocumentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, account } = await requireSession();
  if (isReadOnly(account)) return { error: "The desk is read-only until you choose a plan." };
  const db = getDb();
  const dealId = text(form, "dealId");
  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.accountId, account.id)));
  if (!deal) return { error: "That file is not on your desk." };

  const taskId = text(form, "taskId") || null;
  if (taskId) {
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.dealId, dealId)));
    if (!task) return { error: "That task is not on this file." };
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

  const result = await uploadDocument({
    dealId,
    taskId,
    label: text(form, "label") || file.name,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    bytes: Buffer.from(await file.arrayBuffer()),
    uploadedBy: actorLabel(user),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/deals/${dealId}`);
  return { error: null, ok: `${result.document.label} v${result.document.version} on file.` };
}
