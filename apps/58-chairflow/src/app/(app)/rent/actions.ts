"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, ownedShop } from "@/lib/auth";
import { dollarsToCents, failed, field, succeeded, type FormState } from "@/lib/forms";
import { normalizeHandle } from "@/lib/format";
import {
  addChair,
  assignChair,
  createRentLink,
  createShop,
  markRentPaid,
  rolloverShop,
  updateChairRent,
  waiveRent,
} from "@/server/rent";

async function owner(): Promise<{ userId: string; shopId: string } | null> {
  const session = await getSession();
  if (!session) return null;
  const shop = await ownedShop(session.userId);
  return shop ? { userId: session.userId, shopId: shop.id } : null;
}

export type ShopValues = { name: string; slug: string; address: string; timezone: string };

export async function createShopAction(
  _prev: FormState<ShopValues>,
  formData: FormData,
): Promise<FormState<ShopValues>> {
  const session = await getSession();
  if (!session) redirect("/login");
  const values: ShopValues = {
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    address: field(formData, "address"),
    timezone: field(formData, "timezone") || "America/New_York",
  };
  if (values.name.length < 2) return failed("Give the shop its name.", values);
  const slug = normalizeHandle(values.slug || values.name);
  if (!slug) return failed("The shop's short name needs 3-30 letters, numbers or dashes.", values);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: values.timezone });
  } catch {
    return failed(`"${values.timezone}" is not a timezone we know.`, values);
  }

  const existing = await ownedShop(session.userId);
  if (existing) return failed("You already own a shop.", values);

  try {
    await createShop({
      ownerUserId: session.userId,
      name: values.name,
      slug,
      address: values.address || null,
      timezone: values.timezone,
    });
  } catch {
    return failed(`"${slug}" is taken — pick another short name.`, values);
  }
  revalidatePath("/rent");
  redirect("/rent");
}

export type ChairValues = { label: string; rent: string; handle: string };

export async function addChairAction(
  _prev: FormState<ChairValues>,
  formData: FormData,
): Promise<FormState<ChairValues>> {
  const ctx = await owner();
  if (!ctx) return failed("You do not own a shop.", { label: "", rent: "", handle: "" });
  const values: ChairValues = {
    label: field(formData, "label"),
    rent: field(formData, "rent"),
    handle: field(formData, "handle"),
  };
  if (values.label.length < 1) return failed("Every chair needs a label, like \"Chair 4\".", values);
  const cents = dollarsToCents(values.rent);
  if (cents === null || cents <= 0) return failed("What is the weekly rent, in dollars?", values);

  const chair = await addChair({
    shopId: ctx.shopId,
    label: values.label,
    weeklyRentCents: cents,
  });

  if (values.handle) {
    const assigned = await assignChair({
      chairId: chair.id,
      shopId: ctx.shopId,
      stylistHandle: values.handle,
      actor: { kind: "user", userId: ctx.userId },
    });
    if (!assigned.ok) {
      revalidatePath("/rent");
      return failed(`${values.label} added, but ${assigned.message}`, values);
    }
  }

  revalidatePath("/rent");
  return succeeded(`${values.label} added.`, { label: "", rent: values.rent, handle: "" });
}

export type RentValues = Record<string, string>;

export async function assignChairAction(
  _prev: FormState<RentValues>,
  formData: FormData,
): Promise<FormState<RentValues>> {
  const ctx = await owner();
  if (!ctx) return failed("You do not own a shop.", {});
  const chairId = field(formData, "chairId");
  const handle = field(formData, "handle");
  const result = await assignChair({
    chairId,
    shopId: ctx.shopId,
    stylistHandle: handle || null,
    actor: { kind: "user", userId: ctx.userId },
  });
  if (!result.ok) return failed(result.message, {});
  revalidatePath("/rent");
  return succeeded(handle ? `Assigned to @${handle}.` : "Chair is vacant.", {});
}

export async function updateRentAction(
  _prev: FormState<RentValues>,
  formData: FormData,
): Promise<FormState<RentValues>> {
  const ctx = await owner();
  if (!ctx) return failed("You do not own a shop.", {});
  const cents = dollarsToCents(field(formData, "rent"));
  if (cents === null || cents <= 0) return failed("Weekly rent has to be a dollar amount.", {});
  await updateChairRent({
    chairId: field(formData, "chairId"),
    shopId: ctx.shopId,
    weeklyRentCents: cents,
    actor: { kind: "user", userId: ctx.userId },
  });
  revalidatePath("/rent");
  return succeeded(
    "Saved. Weeks already opened keep the amount they were opened at — changing the rent does not rewrite March.",
    {},
  );
}

/**
 * Mark a rent week paid. Hold-to-confirm in the UI: it moves money in the record, and both
 * sides are reading the same row.
 */
export async function markPaidAction(
  _prev: FormState<RentValues>,
  formData: FormData,
): Promise<FormState<RentValues>> {
  const ctx = await owner();
  if (!ctx) return failed("You do not own a shop.", {});
  const result = await markRentPaid({
    rentPeriodId: field(formData, "rentPeriodId"),
    shopId: ctx.shopId,
    actor: { kind: "user", userId: ctx.userId },
    via: "manual",
    note: field(formData, "note") || undefined,
  });
  if (!result.ok) return failed(result.message, {});
  revalidatePath("/rent");
  return succeeded("Marked paid. The renter sees the same row flip.", {});
}

export async function waiveRentAction(
  _prev: FormState<RentValues>,
  formData: FormData,
): Promise<FormState<RentValues>> {
  const ctx = await owner();
  if (!ctx) return failed("You do not own a shop.", {});
  const result = await waiveRent({
    rentPeriodId: field(formData, "rentPeriodId"),
    shopId: ctx.shopId,
    actor: { kind: "user", userId: ctx.userId },
    note: field(formData, "note") || undefined,
  });
  if (!result.ok) return failed(result.message, {});
  revalidatePath("/rent");
  return succeeded("Waived.", {});
}

export async function sendRentLinkAction(
  _prev: FormState<RentValues>,
  formData: FormData,
): Promise<FormState<RentValues>> {
  const ctx = await owner();
  if (!ctx) return failed("You do not own a shop.", {});
  const result = await createRentLink({
    rentPeriodId: field(formData, "rentPeriodId"),
    shopId: ctx.shopId,
    ownerAccountId: null,
  });
  if (!result.url) return failed(result.reason, {});
  revalidatePath("/rent");
  return succeeded(`Payment link ready: ${result.url}`, {});
}

export async function rolloverAction(
  _prev: FormState<RentValues>,
  formData: FormData,
): Promise<FormState<RentValues>> {
  void formData;
  const ctx = await owner();
  if (!ctx) return failed("You do not own a shop.", {});
  const result = await rolloverShop({ shopId: ctx.shopId });
  revalidatePath("/rent");
  return succeeded(
    result.opened === 0
      ? "Nothing to open — every occupied chair already has its weeks."
      : `Opened ${result.opened} rent ${result.opened === 1 ? "week" : "weeks"}.`,
    {},
  );
}
