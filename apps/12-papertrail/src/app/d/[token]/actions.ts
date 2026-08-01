"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isWellFormedToken, clientIp, paymentState } from "@/lib/esign";
import { loadBundleByToken } from "@/lib/documents";
import { acceptProposal, signContract } from "@/lib/chain";
import { paymentLinkFor } from "@/lib/billing";
import { balanceDue } from "@/lib/money";

/**
 * The client-facing actions. Nobody here is signed in, so every one of them
 * re-derives what is allowed from the token and the document's own state — the
 * form that was rendered is never trusted to have been fair.
 */

export interface PublicState {
  error?: string;
  ok?: boolean;
  message?: string;
  /** Set after signing so the page can replay the signature once. */
  justSigned?: boolean;
  paymentUrl?: string;
}

export async function acceptProposalAction(
  _prev: PublicState,
  formData: FormData,
): Promise<PublicState> {
  const token = String(formData.get("token") ?? "");
  if (!isWellFormedToken(token)) return { error: "That link isn't valid." };

  const bundle = await loadBundleByToken(token);
  if (!bundle) return { error: "We couldn't find that document." };

  const selected = formData.getAll("addon").map(String);
  const result = await acceptProposal(bundle, {
    selectedIds: selected,
    actorEmail: bundle.client.email,
  });
  if (!result.ok) {
    return {
      error:
        result.error === "already_done"
          ? "This proposal has already been accepted — the contract is on its way."
          : "This proposal can no longer be accepted. Ask for a fresh copy.",
    };
  }

  revalidatePath(`/d/${token}`);
  return {
    ok: true,
    message:
      "Accepted. The contract is being drawn up from exactly this — you'll get it for signature shortly.",
  };
}

export async function signContractAction(
  _prev: PublicState,
  formData: FormData,
): Promise<PublicState> {
  const token = String(formData.get("token") ?? "");
  if (!isWellFormedToken(token)) return { error: "That link isn't valid." };

  const bundle = await loadBundleByToken(token);
  if (!bundle) return { error: "We couldn't find that document." };

  const head = await headers();
  const method = formData.get("method") === "drawn" ? "drawn" : "typed";
  const result = await signContract(bundle, {
    signerName: String(formData.get("signerName") ?? ""),
    signerEmail: String(formData.get("signerEmail") ?? ""),
    method,
    signatureData: String(
      (method === "drawn" ? formData.get("signatureData") : formData.get("typedSignature")) ?? "",
    ),
    consented: formData.get("consent") === "on",
    ip: clientIp(head),
    userAgent: (head.get("user-agent") ?? "").slice(0, 400),
  });

  if (!result.ok) {
    const known: Record<string, string> = {
      already_done: "This contract has already been signed.",
      expired: "This link has expired — ask for a fresh copy.",
      voided: "This contract was voided and replaced.",
      not_sent: "This contract isn't ready for signature yet.",
      wrong_type: "That action doesn't apply to this document.",
      malformed: "That link isn't valid.",
      not_found: "We couldn't find that document.",
    };
    return { error: known[result.error ?? ""] ?? result.error ?? "Could not sign" };
  }

  revalidatePath(`/d/${token}`);
  return {
    ok: true,
    justSigned: true,
    message: result.depositInvoice
      ? "Signed. A copy of the record is on this page, and the deposit invoice is in your inbox."
      : "Signed. A copy of the record is on this page.",
  };
}

/**
 * Start a Stripe Checkout for the outstanding balance. Returns the URL rather
 * than redirecting so the client component can show a Stripe failure in place
 * instead of dumping the client on an error page.
 */
export async function startPaymentAction(token: string): Promise<PublicState> {
  if (!isWellFormedToken(token)) return { error: "That link isn't valid." };
  const bundle = await loadBundleByToken(token);
  if (!bundle || !bundle.invoice) return { error: "We couldn't find that invoice." };

  const state = paymentState(token, bundle.document, new Date(), balanceDue(bundle.invoice));
  if (state !== "ok") {
    return {
      error:
        state === "already_done"
          ? "This invoice is already settled — nothing further is needed."
          : "This invoice can't be paid online. Reply to the email and we'll sort it out.",
    };
  }

  try {
    const link = await paymentLinkFor(bundle.invoice, {
      documentTitle: bundle.document.title,
      clientEmail: bundle.client.email,
      publicToken: token,
    });
    if (link.error || !link.url) {
      return {
        error:
          link.error ??
          "Card payment isn't available on this invoice — reply to the email for bank details.",
      };
    }
    return { ok: true, paymentUrl: link.url };
  } catch (err) {
    console.error("[pay] could not create a Stripe session", err);
    return {
      error: "Card payment is unavailable right now — reply to the email and we'll send details.",
    };
  }
}
