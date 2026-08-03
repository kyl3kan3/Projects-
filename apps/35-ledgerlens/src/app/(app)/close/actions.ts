"use server";

/**
 * Closing a period, and creating the accountant's link.
 *
 * `force` is exposed on purpose. The gate is there so a package never contains a guess,
 * but an operator with one unreadable receipt from a vendor that went out of business
 * still has to be able to hand January over. Forcing names every unreviewed document in
 * the package and excludes it from the totals — the package stays honest, it just stops
 * being complete, and it says so.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isPeriod } from "@/lib/dates";
import { isRedirectError, safeMessage, ValidationError } from "@/lib/errors";
import { runClose } from "@/lib/close-package";
import { createShareLink, revokeShareLink } from "@/lib/share";
import { plan } from "@/lib/plans";

export interface CloseFormState {
  error: string | null;
  shareUrl?: string;
}

export async function closePeriodAction(
  _prev: CloseFormState,
  formData: FormData,
): Promise<CloseFormState> {
  const { user, org } = await requireUser();
  const period = String(formData.get("period") ?? "");
  const force = String(formData.get("force") ?? "") === "1";
  if (!isPeriod(period)) return { error: "That is not a valid month." };

  try {
    const result = await runClose(org.id, period, { force, actor: user.id });
    if (result.status === "blocked") {
      return {
        error: `${result.blockingDocuments} ${result.blockingDocuments === 1 ? "item" : "items"} still need review before ${period} can close.`,
      };
    }
    if (result.status === "empty") {
      return { error: "There is nothing confirmed in that month yet." };
    }
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "That month could not be closed.") };
  }

  revalidatePath("/close");
  redirect(`/close?period=${period}&closed=1`);
}

export async function createShareLinkAction(
  _prev: CloseFormState,
  formData: FormData,
): Promise<CloseFormState> {
  const { user, org } = await requireUser();
  const label = String(formData.get("label") ?? "");
  try {
    if (!plan(org.plan).accountantSharing) {
      throw new ValidationError(
        `Read-only accountant links are on the ${plan("operator").name} plan and above.`,
      );
    }
    const created = await createShareLink(org.id, user.id, { label });
    revalidatePath("/close");
    return { error: null, shareUrl: created.url };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "That link could not be created.") };
  }
}

export async function revokeShareLinkAction(formData: FormData): Promise<void> {
  const { user, org } = await requireUser();
  const id = String(formData.get("shareLinkId") ?? "");
  await revokeShareLink(org.id, user.id, id);
  revalidatePath("/close");
  redirect("/close");
}
