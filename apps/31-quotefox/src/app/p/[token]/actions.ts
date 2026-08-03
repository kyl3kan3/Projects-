"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { acceptProposal } from "@/lib/proposals";
import { createDepositCheckout } from "@/lib/deposits";
import { verifyProposalToken } from "@/lib/tokens";

export interface AcceptState {
  error?: string;
  accepted?: boolean;
  /** Set when a deposit is due and Stripe produced a payment page. */
  checkoutUrl?: string;
  /** Set when a deposit is due but cannot be taken online. */
  depositNotice?: string;
}

/**
 * Accept a proposal.
 *
 * The token is the credential, and it is re-verified here rather than trusted from
 * the page render — a server action is a public endpoint, so the fact that the page
 * rendered proves nothing about this request.
 *
 * The client IP comes from the proxy headers because the acceptance record is the
 * legally interesting artifact; it is stored alongside the typed name and the
 * timestamp, and archived into the PDF snapshot.
 */
export async function acceptAction(token: string, typedName: string): Promise<AcceptState> {
  const verified = await verifyProposalToken(token);
  if (!verified.ok) {
    return {
      error:
        verified.reason === "expired"
          ? "This proposal has expired. Ask your contractor for a fresh link."
          : verified.reason === "revoked"
            ? "A newer version of this proposal was sent. Please open the most recent email."
            : verified.reason === "withdrawn"
              ? "Your contractor withdrew this proposal."
              : "This link is not valid.",
    };
  }

  const headerBag = await headers();
  const ip =
    headerBag.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerBag.get("x-real-ip") ??
    null;

  const result = await acceptProposal(verified.proposal.id, typedName, ip);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/p/${token}`);

  if (verified.proposal.depositCents > 0) {
    const checkout = await createDepositCheckout(verified.proposal.id);
    if (checkout.ok) return { accepted: true, checkoutUrl: checkout.url };
    return { accepted: true, depositNotice: checkout.message };
  }
  return { accepted: true };
}

/** Start (or restart) the deposit payment for an already-accepted proposal. */
export async function payDepositAction(token: string): Promise<AcceptState> {
  const verified = await verifyProposalToken(token);
  if (!verified.ok) return { error: "This link is no longer valid." };
  const checkout = await createDepositCheckout(verified.proposal.id);
  if (checkout.ok) return { accepted: true, checkoutUrl: checkout.url };
  return { accepted: true, depositNotice: checkout.message };
}
