"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { addUser, requireSession } from "@/lib/auth";
import { field, formError, formOk, snapshot, type FormState } from "@/lib/form";
import { parseMoneyToCents, parsePercentToBps } from "@/lib/money";
import { canAddUser, canWrite, entitlements } from "@/lib/plans";
import { mergeSettings } from "@/lib/settings";
import type { DamageFee, UserRole } from "@/db/schema";

function readFees(form: FormData): DamageFee[] {
  const labels = form.getAll("feeLabel").map((v) => String(v).trim());
  const amounts = form.getAll("feeAmount").map((v) => String(v).trim());
  const out: DamageFee[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (!labels[i]) continue;
    out.push({
      label: labels[i],
      amountCents: amounts[i] ? parseMoneyToCents(amounts[i]) : 0,
    });
  }
  return out;
}

export async function saveSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  try {
    const { account, user } = await requireSession();
    if (user.role !== "owner") {
      return formError("Only the owner can change deposit, tax and fee defaults.", values);
    }
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);

    const settings = mergeSettings(account.settings, {
      depositPercentBps: parsePercentToBps(field(form, "depositPercent")),
      depositMinimumCents: parseMoneyToCents(field(form, "depositMinimum")),
      taxRateBps: parsePercentToBps(field(form, "taxRate")),
      deliveryFeeCents: parseMoneyToCents(field(form, "deliveryFee")),
      damageFeeDefaults: readFees(form),
      terms: field(form, "terms"),
      damageClause: field(form, "damageClause"),
    });

    await getDb()
      .update(accounts)
      .set({
        name: field(form, "yardName") || account.name,
        timezone: field(form, "timezone") || account.timezone,
        settings,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, account.id));
    await audit(account.id, user.email, "settings.saved", account.id, {
      depositPercentBps: settings.depositPercentBps,
      taxRateBps: settings.taxRateBps,
    });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not save the settings.", values);
  }
  revalidatePath("/settings");
  return formOk("Saved. New quotes use these defaults; existing orders keep their own numbers.", values);
}

export async function addUserAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  delete values.password;
  try {
    const { account, user } = await requireSession();
    if (user.role !== "owner") return formError("Only the owner can add teammates.", values);

    const existing = await getDb().select().from(users).where(eq(users.accountId, account.id));
    const gate = canAddUser(entitlements(account), existing.length);
    if (!gate.allowed) return formError(gate.reason ?? "Seat limit reached.", values);

    const role = field(form, "role");
    const allowed: UserRole[] = ["owner", "staff", "driver"];
    if (!allowed.includes(role as UserRole)) return formError("Pick a role.", values);

    await addUser({
      accountId: account.id,
      email: field(form, "email"),
      password: String(form.get("password") ?? ""),
      name: field(form, "name"),
      role: role as UserRole,
    });
    await audit(account.id, user.email, "user.added", account.id, { email: field(form, "email"), role });
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not add the teammate.", values);
  }
  revalidatePath("/settings");
  return formOk("Added. They can sign in with that email and password.", values);
}
