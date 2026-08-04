"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { ConflictError } from "@/lib/availability";
import { renderAndStoreContract } from "@/lib/documents";
import { startHold } from "@/lib/deposits";
import { sendMail } from "@/lib/email";
import { field, formError, formOk, snapshot, type FormState } from "@/lib/form";
import { hashToken, verifyQuoteToken } from "@/lib/links";
import { formatMoney } from "@/lib/money";
import { acceptQuote, getOrder } from "@/lib/orders";
import { putFile } from "@/lib/storage";

const MAX_SIGNATURE_BYTES = 400 * 1024;

/**
 * Accept the quote: re-check availability, capture the signature, hash the
 * document, then start the deposit hold.
 *
 * The order of those four things is the product. The availability re-check runs
 * *first*, inside the transaction that flips the status, so a quote that sat in an
 * inbox for a week cannot commit gear that has since been sold. When it fails,
 * nothing at all is written and the customer is told which order took the gear —
 * because the shop is about to get a phone call and a vague "no longer available"
 * makes that call worse.
 */
export async function acceptQuoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  delete values.signature;
  delete values.token;

  const token = field(form, "token");
  const verified = await verifyQuoteToken(token);
  if (!verified) return formError("This link has expired. Ask the yard to send a fresh one.", values);

  const db = getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.signTokenHash, hashToken(token)));
  if (!order || order.id !== verified.orderId) {
    return formError("This link is no longer the current one for this quote.", values);
  }
  if (order.status !== "sent" && order.status !== "draft") {
    return formError("This quote has already been accepted.", values);
  }

  const signerName = field(form, "signerName");
  const initials = field(form, "initials");
  const signature = String(form.get("signature") ?? "");
  if (signerName.length < 2) return formError("Type your full name to sign.", values);
  if (initials.length < 1) return formError("Initial the damage terms to continue.", values);
  if (!signature.startsWith("data:image/png;base64,")) {
    return formError("Draw your signature in the box before accepting.", values);
  }
  const base64 = signature.slice("data:image/png;base64,".length);
  if (base64.length > MAX_SIGNATURE_BYTES) {
    return formError("That signature image is too large. Clear it and try a shorter stroke.", values);
  }

  let signatureKey: string | null = null;
  try {
    const stored = await putFile(order.accountId, "signature", "png", Buffer.from(base64, "base64"));
    signatureKey = stored.key;
  } catch {
    // A signature image that would not store must not block the acceptance —
    // the typed name, the initials and the document hash are the binding record.
    signatureKey = null;
  }

  try {
    await acceptQuote({
      accountId: order.accountId,
      orderId: order.id,
      signerName,
      signerInitials: initials.toUpperCase(),
      signatureKey,
    });
  } catch (err) {
    if (err instanceof ConflictError) return formError(err.detail, values);
    return formError(
      err instanceof Error ? err.message : "Could not accept the quote right now.",
      values,
    );
  }

  /**
   * From here on the order **is** accepted, so nothing may throw its way out of
   * this action. The first version did, and it was not hypothetical: rendering
   * the contract threw `WinAnsi cannot encode "→"` on a perfectly ordinary
   * window string, which would have left the customer looking at a 500 while
   * their signature, their acceptance and the gear commitment were all already
   * in the database. A failure past this line is recorded and reported, never
   * raised.
   */
  const problems: string[] = [];
  try {
    await renderAndStoreContract(order.accountId, order.id);
  } catch (err) {
    problems.push(
      `The PDF copy of your agreement could not be generated (${err instanceof Error ? err.message : "unknown error"}). Your signature and initials are recorded and the yard has been told.`,
    );
    console.error("[accept] contract render failed", { orderId: order.id, err });
  }

  let held: { redirectUrl: string | null; held: boolean; reason: string };
  try {
    held = await startHold(order.accountId, order.id, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "the card gateway did not answer";
    console.error("[accept] hold failed", { orderId: order.id, err });
    await db
      .update(orders)
      .set({ depositError: `Could not start the deposit hold: ${message}`, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    revalidatePath(`/q/${token}`);
    return formError(
      `You are signed and the gear is held for your dates, but the card step could not open (${message}). The yard has this on their screen and will send you a fresh card link.`,
      values,
    );
  }

  const full = await getOrder(order.accountId, order.id);
  if (full?.customer.email) {
    await sendMail({
      to: full.customer.email,
      subject: `Order #${full.order.number} — signed`,
      text: [
        `${full.customer.name},`,
        ``,
        `Thank you — order #${full.order.number} is signed and on the calendar for ${full.order.outOn}.`,
        ``,
        `Total ${formatMoney(full.order.totalCents)}. Security deposit hold ${formatMoney(full.order.depositCents)} — a hold on your card, not a charge. A clean return releases it the same day.`,
        ``,
        `Your copy of the signed agreement is attached to this order at the yard, and its sha256 hash is on file: ${full.order.docHash ?? "pending"}.`,
      ].join("\n"),
    });
  }

  revalidatePath(`/q/${token}`);
  if (held.redirectUrl) redirect(held.redirectUrl);
  return formOk([held.reason, ...problems].join(" "), values);
}
