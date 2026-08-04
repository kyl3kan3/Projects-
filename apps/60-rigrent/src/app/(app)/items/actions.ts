"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { checkbox, field, formError, formOk, snapshot, type FormState } from "@/lib/form";
import {
  addHold,
  addUnit,
  createItem,
  reactivateItem,
  removeHold,
  retireItem,
  setUnitStatus,
  updateItem,
} from "@/lib/items";
import { parseCount, parseMoneyToCents } from "@/lib/money";
import {
  canUseMaintenanceHolds,
  canUseSerials,
  canWrite,
  entitlements,
} from "@/lib/plans";
import type { DamageFee } from "@/db/schema";

/**
 * The damage fee schedule arrives as parallel arrays of labels and amounts,
 * because the form lets a shop add rows without a round trip. Rows with an empty
 * label are dropped rather than saved blank — a fee schedule with a nameless
 * $25 line on it is not a document anybody can argue from.
 */
function readFees(form: FormData): DamageFee[] {
  const labels = form.getAll("feeLabel").map((v) => String(v).trim());
  const amounts = form.getAll("feeAmount").map((v) => String(v).trim());
  const out: DamageFee[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (!labels[i]) continue;
    const amount = amounts[i] ?? "";
    out.push({ label: labels[i], amountCents: amount ? parseMoneyToCents(amount) : 0 });
  }
  return out;
}

function optionalMoney(value: string): number | null {
  return value ? parseMoneyToCents(value) : null;
}

export async function createItemAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  let itemId: string;
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);

    const item = await createItem({
      accountId: account.id,
      name: field(form, "name"),
      category: field(form, "category") || null,
      ownedCount: parseCount(field(form, "ownedCount"), "Owned count"),
      dailyRateCents: parseMoneyToCents(field(form, "dailyRate")),
      weekendRateCents: optionalMoney(field(form, "weekendRate")),
      replacementCents: optionalMoney(field(form, "replacement")),
      trackedBy: field(form, "trackedBy") === "serial" ? "serial" : "quantity",
      damageFees: readFees(form),
      actor: user.email,
    });
    itemId = item.id;
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not add the item.", values);
  }
  revalidatePath("/items");
  redirect(`/items/${itemId}`);
}

export async function updateItemAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);

    await updateItem({
      accountId: account.id,
      itemId: field(form, "itemId"),
      name: field(form, "name"),
      category: field(form, "category") || null,
      ownedCount: parseCount(field(form, "ownedCount"), "Owned count"),
      dailyRateCents: parseMoneyToCents(field(form, "dailyRate")),
      weekendRateCents: optionalMoney(field(form, "weekendRate")),
      replacementCents: optionalMoney(field(form, "replacement")),
      damageFees: readFees(form),
      actor: user.email,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not save the item.", values);
  }
  revalidatePath("/items");
  revalidatePath(`/items/${field(form, "itemId")}`);
  return formOk("Saved.", values);
}

export async function retireItemAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.");
    if (checkbox(form, "reactivate")) {
      await reactivateItem(account.id, field(form, "itemId"));
    } else {
      await retireItem(account.id, field(form, "itemId"), user.email);
    }
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not change the item.");
  }
  revalidatePath("/items");
  revalidatePath(`/items/${field(form, "itemId")}`);
  return formOk("Done.");
}

export async function addUnitAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  try {
    const { account, user } = await requireSession();
    const gate = canUseSerials(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "Serials are not on this plan.", values);
    await addUnit({
      accountId: account.id,
      itemId: field(form, "itemId"),
      serial: field(form, "serial"),
      actor: user.email,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not add the unit.", values);
  }
  revalidatePath(`/items/${field(form, "itemId")}`);
  return formOk("Unit added.");
}

export async function setUnitStatusAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { account } = await requireSession();
    const gate = canUseSerials(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "Serials are not on this plan.");
    const status = field(form, "status");
    if (status !== "in_service" && status !== "maintenance" && status !== "lost") {
      return formError("Unknown unit status.");
    }
    await setUnitStatus({ accountId: account.id, unitId: field(form, "unitId"), status });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not update the unit.");
  }
  revalidatePath(`/items/${field(form, "itemId")}`);
  return formOk("Updated.");
}

export async function addHoldAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  try {
    const { account, user } = await requireSession();
    const gate = canUseMaintenanceHolds(entitlements(account));
    if (!gate.allowed) {
      return formError(gate.reason ?? "Maintenance holds are not on this plan.", values);
    }
    await addHold({
      accountId: account.id,
      itemId: field(form, "itemId"),
      quantity: parseCount(field(form, "quantity"), "Quantity"),
      startsOn: field(form, "startsOn"),
      endsOn: field(form, "endsOn"),
      reason: field(form, "reason") || null,
      actor: user.email,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not add the hold.", values);
  }
  revalidatePath(`/items/${field(form, "itemId")}`);
  revalidatePath("/items");
  return formOk("Hold added — availability now subtracts it.", values);
}

export async function removeHoldAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const { account } = await requireSession();
    const gate = canUseMaintenanceHolds(entitlements(account));
    if (!gate.allowed) {
      return formError(gate.reason ?? "Maintenance holds are not on this plan.");
    }
    await removeHold(account.id, field(form, "holdId"));
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not remove the hold.");
  }
  revalidatePath(`/items/${field(form, "itemId")}`);
  revalidatePath("/items");
  return formOk("Hold removed.");
}
