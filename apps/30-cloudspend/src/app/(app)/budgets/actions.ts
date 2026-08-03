"use server";

/**
 * Budget endpoints: create one, delete one. Both re-resolve the org and both
 * enforce the plan gate server-side — a hidden button is not a permission check.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { budgets, type BudgetScope } from "@/db/schema";
import { requireOrg } from "@/lib/auth";
import { dollarsToMicros } from "@/lib/money";
import { plan } from "@/lib/plans";

/**
 * React 19 resets an uncontrolled form once its action completes, so a rejected
 * submit is echoed back with what was typed.
 */
export interface BudgetState {
  error?: string;
  ok?: boolean;
  values?: { name?: string; scopeValue?: string; monthlyLimit?: string; thresholds?: string };
}

const SCOPES: BudgetScope[] = ["service", "tag", "account"];

export async function createBudgetAction(
  _prev: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const { org } = await requireOrg();
  const name = String(formData.get("name") ?? "").trim();
  const scope = String(formData.get("scope") ?? "") as BudgetScope;
  const scopeValue = String(formData.get("scopeValue") ?? "").trim();
  const limitRaw = String(formData.get("monthlyLimit") ?? "").replace(/[$,\s]/g, "");
  const thresholdsRaw = String(formData.get("thresholds") ?? "80,100");
  const values = { name, scopeValue, monthlyLimit: limitRaw, thresholds: thresholdsRaw };
  const reject = (error: string): BudgetState => ({ error, values });

  if (!plan(org.plan).budgets) {
    return reject("Budgets are a Startup feature. Change plan in Settings, then Billing.");
  }
  if (name.length < 2) return reject("Give the budget a name");
  if (!SCOPES.includes(scope)) return reject("Pick what the budget covers");
  if (!scopeValue) return reject("Pick a service, tag or account for the budget");
  if (scope === "tag" && !/^[^=|]+=[^=|]+$/.test(scopeValue)) {
    return reject("A tag scope looks like Team=platform");
  }
  const limit = Number(limitRaw);
  if (!Number.isFinite(limit) || limit <= 0) return reject("Enter a monthly limit in dollars");

  const thresholds = [
    ...new Set(
      thresholdsRaw
        .split(",")
        .map((t) => Math.round(Number(t.trim())))
        .filter((t) => Number.isFinite(t) && t > 0 && t <= 500),
    ),
  ].sort((a, b) => a - b);
  if (thresholds.length === 0) return reject("Enter at least one alert threshold, e.g. 80,100");

  const db = getDb();
  try {
    await db.insert(budgets).values({
      orgId: org.id,
      name,
      scope,
      scopeValue,
      monthlyLimitMicros: dollarsToMicros(limit),
      thresholds,
    });
  } catch {
    return reject(`A budget already covers ${scopeValue}`);
  }
  revalidatePath("/budgets");
  return { ok: true };
}

export async function deleteBudgetAction(
  _prev: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const { org } = await requireOrg();
  const id = String(formData.get("budgetId") ?? "");
  if (!id) return { error: "Missing budget" };
  const db = getDb();
  await db.delete(budgets).where(and(eq(budgets.orgId, org.id), eq(budgets.id, id)));
  revalidatePath("/budgets");
  return { ok: true };
}
