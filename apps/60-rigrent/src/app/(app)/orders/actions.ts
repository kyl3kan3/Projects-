"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getCustomer, createCustomer } from "@/lib/customers";
import { releaseHold, startHold } from "@/lib/deposits";
import { sendMail } from "@/lib/email";
import { checkbox, field, formError, formOk, intField, snapshot, type FormState } from "@/lib/form";
import { mintQuoteToken, quoteLinkUrl } from "@/lib/links";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { itemSummary } from "@/lib/order-core";
import {
  addLine,
  cancelOrder,
  closeOrder,
  createOrder,
  getOrder,
  markOut,
  markSent,
  removeLine,
  setDepositAmount,
  setLineQuantity,
  setWindow,
} from "@/lib/orders";
import { formatWindow } from "@/lib/dates";
import { canWrite, entitlements } from "@/lib/plans";
import { settleDeposit, waiveClaim, updateClaim, addClaim } from "@/lib/claims";

/* --------------------------------------------------------------- creation --- */

export async function createOrderAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  let orderId: string;
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);

    let customerId = field(form, "customerId");
    if (customerId === "new") {
      const created = await createCustomer({
        accountId: account.id,
        name: field(form, "newCustomerName"),
        email: field(form, "newCustomerEmail") || null,
        phone: field(form, "newCustomerPhone") || null,
        company: null,
        taxExempt: false,
        notes: null,
        actor: user.email,
      });
      customerId = created.id;
    }
    if (!customerId) return formError("Pick a customer, or add a new one.", values);
    const customer = await getCustomer(account.id, customerId);
    if (!customer) return formError("That customer is not in this account.", values);

    const order = await createOrder({
      accountId: account.id,
      customerId,
      outOn: field(form, "outOn"),
      dueBackOn: field(form, "dueBackOn"),
      delivery: checkbox(form, "delivery"),
      address: field(form, "address") || null,
      notes: field(form, "notes") || null,
      actor: user.email,
    });
    orderId = order.id;
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not start the quote.", values);
  }
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

/* ------------------------------------------------------------ line edits --- */

export async function setWindowAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  const orderId = field(form, "orderId");
  try {
    const { account } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);
    await setWindow({
      accountId: account.id,
      orderId,
      outOn: field(form, "outOn"),
      dueBackOn: field(form, "dueBackOn"),
      delivery: checkbox(form, "delivery"),
      address: field(form, "address") || null,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not change the window.", values);
  }
  revalidatePath(`/orders/${orderId}`);
  return formOk("Window updated — every line re-priced for the new dates.", values);
}

export async function addLineAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  const orderId = field(form, "orderId");
  try {
    const { account } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);
    const quantity = intField(form, "quantity", 0);
    if (quantity <= 0) return formError("Enter how many you need.", values);
    await addLine({
      accountId: account.id,
      orderId,
      itemId: field(form, "itemId"),
      quantity,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not add the line.", values);
  }
  revalidatePath(`/orders/${orderId}`);
  return formOk("Line added.", values);
}

export async function setLineQuantityAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  const orderId = field(form, "orderId");
  try {
    const { account } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);
    await setLineQuantity({
      accountId: account.id,
      orderId,
      lineId: field(form, "lineId"),
      quantity: intField(form, "quantity", 0),
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not change the quantity.", values);
  }
  revalidatePath(`/orders/${orderId}`);
  return formOk("Quantity updated.", values);
}

export async function removeLineAction(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = field(form, "orderId");
  try {
    const { account } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.");
    await removeLine({ accountId: account.id, orderId, lineId: field(form, "lineId") });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not remove the line.");
  }
  revalidatePath(`/orders/${orderId}`);
  return formOk("Line removed.");
}

export async function setDepositAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  const orderId = field(form, "orderId");
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);
    const cents = parseMoneyToCents(field(form, "deposit"));
    await setDepositAmount(account.id, orderId, cents);
    await audit(account.id, user.email, "order.deposit_set", orderId, { depositCents: cents });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not set the deposit.", values);
  }
  revalidatePath(`/orders/${orderId}`);
  return formOk("Deposit updated.", values);
}

/* -------------------------------------------------------------- lifecycle --- */

export async function sendQuoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = field(form, "orderId");
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.");

    const full = await getOrder(account.id, orderId);
    if (!full) return formError("That order is not in this account.");
    if (full.lines.length === 0) return formError("Add at least one line before sending it.");
    if (!full.customer.email) {
      return formError(
        `${full.customer.name} has no email address on file. Add one on the customer record and the quote link will send.`,
      );
    }

    const { token, hash } = await mintQuoteToken(orderId);
    await markSent(account.id, orderId, hash, user.email);

    const outcome = await sendMail({
      to: full.customer.email,
      subject: `Your rental quote from ${account.name} — order #${full.order.number}`,
      text: [
        `${full.customer.name},`,
        ``,
        `Here is your quote from ${account.name} for ${formatWindow(full.order.outOn, full.order.dueBackOn)}.`,
        ``,
        itemSummary(full.lines.map((l) => ({ quantity: l.quantity, itemName: l.itemName }))),
        ``,
        `Total ${formatMoney(full.order.totalCents)} · security deposit hold ${formatMoney(full.order.depositCents)}.`,
        ``,
        `Read it, sign it, and authorise the deposit here:`,
        quoteLinkUrl(token),
        ``,
        `The deposit is a hold on your card, not a charge. A clean return releases it the same day.`,
      ].join("\n"),
    });

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");

    /**
     * The link has to come back with the message, and this is the only chance to
     * do it: only the sha256 of the token is stored, so nothing can re-derive it
     * later. Without this the dry-run and mail-failure paths both told the shop
     * "the link is below" when there was no link anywhere on the screen — which
     * is how a quote quietly never reaches a customer.
     */
    const url = quoteLinkUrl(token);
    if (!outcome.ok) {
      return formError(
        `The quote is marked sent, but the email did not go: ${outcome.error}. Send this link by hand — it is the only copy: ${url}`,
      );
    }
    return formOk(
      outcome.dryRun
        ? `Quote link minted. Email is in dry-run mode, so nothing was sent — send this link by hand, it is the only copy: ${url}`
        : `Sent to ${full.customer.email}. The same link, if you need to pass it on: ${url}`,
    );
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not send the quote.");
  }
}

export async function markOutAction(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = field(form, "orderId");
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.");
    await markOut(account.id, orderId, user.email);
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not mark it out.");
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/returns");
  return formOk("Marked out. It is now on the returns queue for its due-back date.");
}

export async function cancelOrderAction(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = field(form, "orderId");
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.");
    const full = await getOrder(account.id, orderId);
    if (full?.order.depositStatus === "held") {
      await releaseHold(account.id, orderId, user.email);
    }
    await cancelOrder(account.id, orderId, user.email);
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not cancel the order.");
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return formOk("Cancelled. Any deposit hold was released.");
}

export async function closeOrderAction(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = field(form, "orderId");
  try {
    const { account, user } = await requireSession();
    await closeOrder(account.id, orderId, user.email);
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not close the order.");
  }
  revalidatePath(`/orders/${orderId}`);
  return formOk("Closed.");
}

/** Staff-side retry when a customer abandoned the card step. */
export async function retryHoldAction(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = field(form, "orderId");
  try {
    const { account } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.");
    const started = await startHold(account.id, orderId);
    revalidatePath(`/orders/${orderId}`);
    if (started.redirectUrl) {
      return formOk(
        `Send the customer back to their quote link to authorise the hold. ${started.reason}`,
      );
    }
    return formOk(started.reason);
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not start the hold.");
  }
}

/* ----------------------------------------------------------------- claims --- */

export async function settleDepositAction(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = field(form, "orderId");
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.");
    const result = await settleDeposit({ accountId: account.id, orderId, actor: user.email });
    await closeOrder(account.id, orderId, user.email);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/returns");
    return formOk(
      result.captured
        ? `Captured ${formatMoney(result.capturedCents)}; ${formatMoney(result.releasedCents)} released. ${result.note}`
        : result.note,
    );
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not settle the deposit.");
  }
}

export async function waiveClaimAction(_prev: FormState, form: FormData): Promise<FormState> {
  const orderId = field(form, "orderId");
  try {
    const { account, user } = await requireSession();
    await waiveClaim({ accountId: account.id, claimId: field(form, "claimId"), actor: user.email });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not waive the claim.");
  }
  revalidatePath(`/orders/${orderId}`);
  return formOk("Waived. Nothing will be captured for it.");
}

export async function updateClaimAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  const orderId = field(form, "orderId");
  try {
    const { account, user } = await requireSession();
    await updateClaim({
      accountId: account.id,
      claimId: field(form, "claimId"),
      description: field(form, "description"),
      amountCents: parseMoneyToCents(field(form, "amount")),
      actor: user.email,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not update the claim.", values);
  }
  revalidatePath(`/orders/${orderId}`);
  return formOk("Claim updated.", values);
}

export async function addClaimAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  const orderId = field(form, "orderId");
  try {
    const { account, user } = await requireSession();
    const kind = field(form, "kind") === "missing" ? "missing" : "damage";
    await addClaim({
      accountId: account.id,
      orderId,
      orderLineId: field(form, "orderLineId"),
      kind,
      description: field(form, "description"),
      amountCents: parseMoneyToCents(field(form, "amount")),
      actor: user.email,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not add the claim.", values);
  }
  revalidatePath(`/orders/${orderId}`);
  return formOk("Claim drafted. Nothing is charged until you settle the deposit.", values);
}
