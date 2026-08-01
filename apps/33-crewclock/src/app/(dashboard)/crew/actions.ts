"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, users, type Locale, type OvertimeRule, type Role } from "@/db/schema";
import { generateCrewCode, requireOffice } from "@/lib/auth";
import { syncSeatQuantity } from "@/lib/stripe";

const ROLES: Role[] = ["owner", "office", "crew"];
const RULES: OvertimeRule[] = ["weekly_40", "daily_8_weekly_40", "none"];

function parseRateCents(raw: string): number {
  const value = Number(raw.replace(/[$,]/g, ""));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

/**
 * Add a crew member. They get a code, not an invite email: the crew often have
 * no work email, and a code the foreman reads out loud at the truck is the
 * fastest path from "hired" to "punched in".
 */
export async function addCrewAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/crew?error=name");

  const role = String(formData.get("role") ?? "crew") as Role;
  const rule = String(formData.get("overtimeRule") ?? "weekly_40") as OvertimeRule;
  const locale = String(formData.get("locale") ?? org.defaultLocale) as Locale;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;

  const db = getDb();
  if (email) {
    const [clash] = await db.select().from(users).where(eq(users.email, email));
    if (clash) redirect("/crew?error=email");
  }

  // Codes are unique across every org, so retry on the astronomically unlikely
  // collision rather than handing two people the same code.
  let created: { id: string; crewCode: string | null } | undefined;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const [row] = await db
      .insert(users)
      .values({
        organizationId: org.id,
        name,
        email,
        phone: String(formData.get("phone") ?? "").trim() || null,
        role: ROLES.includes(role) ? role : "crew",
        locale: locale === "es" ? "es" : "en",
        hourlyCostCents: parseRateCents(String(formData.get("rate") ?? "0")),
        overtimeRule: RULES.includes(rule) ? rule : "weekly_40",
        payrollFileNumber: String(formData.get("payrollFileNumber") ?? "").trim() || null,
        crewCode: generateCrewCode(),
      })
      .onConflictDoNothing({ target: users.crewCode })
      .returning({ id: users.id, crewCode: users.crewCode });
    created = row;
  }
  if (!created) redirect("/crew?error=code");

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.id,
    action: "crew.add",
    target: created.id,
    metadata: { name, role },
  });

  // Seats are billed per active member, so the subscription moves with the crew.
  await syncSeatQuantity(org.id);

  revalidatePath("/crew");
  redirect(`/crew?added=${created.crewCode ?? ""}`);
}

export async function setCrewActiveAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "1";
  if (!userId) return;
  if (userId === user.id && !active) redirect("/crew?error=self");

  const db = getDb();
  await db
    .update(users)
    .set({ active })
    .where(and(eq(users.id, userId), eq(users.organizationId, org.id)));

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.id,
    action: active ? "crew.reactivate" : "crew.deactivate",
    target: userId,
  });

  await syncSeatQuantity(org.id);
  revalidatePath("/crew");
}

export async function updateCrewAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  const rule = String(formData.get("overtimeRule") ?? "weekly_40") as OvertimeRule;
  const db = getDb();
  await db
    .update(users)
    .set({
      hourlyCostCents: parseRateCents(String(formData.get("rate") ?? "0")),
      overtimeRule: RULES.includes(rule) ? rule : "weekly_40",
      payrollFileNumber: String(formData.get("payrollFileNumber") ?? "").trim() || null,
      locale: String(formData.get("locale") ?? "en") === "es" ? "es" : "en",
    })
    .where(and(eq(users.id, userId), eq(users.organizationId, org.id)));

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.id,
    action: "crew.update",
    target: userId,
  });
  revalidatePath("/crew");
}
