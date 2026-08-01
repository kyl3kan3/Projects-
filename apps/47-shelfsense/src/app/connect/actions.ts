"use server";

/**
 * Connecting a store.
 *
 * Two paths, and the difference between them is stated on screen rather than
 * hidden: a real Shopify install (OAuth, needs the app's Partner credentials), and
 * the labelled demo store, which is the only way to see the product work in an
 * environment with no Shopify credentials.
 *
 * The demo path is not a mock of the product. It creates a shop flagged `is_demo`,
 * which makes the Shopify client a deterministic fake, and then runs the ordinary
 * backfill, the ordinary velocity maths and the ordinary forecast writer against it.
 * Every screen afterwards is rendered from real rows in Postgres.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMerchant } from "@/lib/auth";
import { safeMessage } from "@/lib/errors";
import { createDemoShop } from "@/lib/install";
import { isValidShopDomain } from "@/lib/shopify";
import { onboardShop } from "@/lib/tick";

export interface ConnectState {
  error: string | null;
  note: string | null;
}

/** Send the merchant into the Shopify OAuth flow for a domain they typed. */
export async function startInstallAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  await requireMerchant();
  const raw = String(formData.get("shop") ?? "").trim().toLowerCase();
  const domain = raw.includes(".") ? raw : `${raw}.myshopify.com`;
  if (!isValidShopDomain(domain)) {
    return {
      error: "That is not a Shopify store domain. It looks like your-store.myshopify.com.",
      note: null,
    };
  }
  redirect(`/api/shopify/auth?shop=${encodeURIComponent(domain)}`);
}

/**
 * Create the demo store and take it all the way to a populated dashboard.
 *
 * Done synchronously because the merchant is watching: the backfill is bounded to a
 * budget and, if a store were large enough not to finish, the tick would carry it
 * on and the reorder screen shows the real import progress meanwhile.
 */
export async function loadDemoStoreAction(
  _prev: ConnectState,
  _formData: FormData,
): Promise<ConnectState> {
  const { merchant } = await requireMerchant();
  try {
    const shop = await createDemoShop(merchant.id);
    const result = await onboardShop(shop, { deadline: Date.now() + 110_000 });
    if (!result.done) {
      revalidatePath("/reorder");
      return {
        error: null,
        note: `Imported ${result.ordersImported.toLocaleString("en-US")} orders so far — the rest continues in the background.`,
      };
    }
  } catch (err) {
    return { error: safeMessage(err, "The demo store could not be loaded."), note: null };
  }
  revalidatePath("/reorder");
  redirect("/reorder?demo=loaded");
}
