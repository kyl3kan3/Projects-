"use server";

/**
 * Settings actions: company details (which are the 300A header fields), ops
 * contacts, crews, and the roster.
 *
 * The headcount gate lives in `addEmployeeAction`: adding past the plan limit
 * returns an upgrade prompt rather than failing silently, and nothing already on
 * the roster stops working.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { companies, crews, employees } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { canAddEmployee } from "@/lib/billing";
import type { ActionState } from "@/lib/action-state";

function str(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const companySchema = z.object({
  name: z.string().min(1, "The company needs a name"),
  establishmentName: z.string().optional().default(""),
  streetAddress: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  postalCode: z.string().optional().default(""),
  naicsCode: z.string().optional().default(""),
  industryDescription: z.string().optional().default(""),
  timezone: z.string().min(1),
  opsEmail: z.string().optional().default(""),
  opsPhone: z.string().optional().default(""),
  talkDay: z.coerce.number().int().min(0).max(6),
  missedGraceHours: z.coerce.number().int().min(0).max(120),
});

export async function saveCompanyAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const parsed = companySchema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the form", message: null };
    }
    const d = parsed.data;
    if (d.opsEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.opsEmail)) {
      return { error: "That ops email does not look right", message: null };
    }
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: d.timezone });
    } catch {
      return { error: "That is not an IANA time zone", message: null };
    }

    const db = getDb();
    await db
      .update(companies)
      .set({
        name: d.name,
        establishmentName: d.establishmentName || d.name,
        streetAddress: d.streetAddress || null,
        city: d.city || null,
        state: d.state || null,
        postalCode: d.postalCode || null,
        naicsCode: d.naicsCode || null,
        industryDescription: d.industryDescription || null,
        timezone: d.timezone,
        settings: {
          ...company.settings,
          talkDay: d.talkDay,
          missedGraceHours: d.missedGraceHours,
          opsEmail: d.opsEmail || null,
          opsPhone: d.opsPhone || null,
        },
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id));

    revalidatePath("/settings");
    revalidatePath("/talks");
    return { error: null, message: "Saved. These fields are the 300A's establishment header." };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

const crewSchema = z.object({
  name: z.string().min(1, "Name the crew"),
  siteLabel: z.string().optional().default(""),
  foremanName: z.string().min(1, "Who is the foreman?"),
  foremanPhone: z.string().optional().default(""),
  foremanEmail: z.string().optional().default(""),
  talkDay: z.coerce.number().int().min(0).max(6),
});

export async function addCrewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const parsed = crewSchema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the form", message: null };
    }
    const d = parsed.data;
    if (!d.foremanPhone && !d.foremanEmail) {
      return {
        error: "A crew needs a foreman phone or email — that is where the Monday link goes.",
        message: null,
      };
    }
    // The Company plan is where multiple crews start, but a crew is not a
    // compliance feature and blocking a second one would strand records.
    const db = getDb();
    await db.insert(crews).values({
      companyId: company.id,
      name: d.name,
      siteLabel: d.siteLabel || null,
      foremanName: d.foremanName,
      foremanPhone: d.foremanPhone || null,
      foremanEmail: d.foremanEmail || null,
      talkDay: d.talkDay,
    });
    revalidatePath("/settings/crews");
    revalidatePath("/talks");
    return { error: null, message: `${d.name} added. Next week's talk goes out automatically.` };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

export async function toggleCrewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const crewId = str(form, "crewId");
    const db = getDb();
    const [crew] = await db
      .select()
      .from(crews)
      .where(and(eq(crews.id, crewId), eq(crews.companyId, company.id)));
    if (!crew) return { error: "No such crew", message: null };
    await db.update(crews).set({ active: !crew.active }).where(eq(crews.id, crewId));
    revalidatePath("/settings/crews");
    revalidatePath("/talks");
    return {
      error: null,
      message: crew.active
        ? `${crew.name} is inactive. No more talks are scheduled for it; every past record stays.`
        : `${crew.name} is active again.`,
    };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

const employeeSchema = z.object({
  name: z.string().min(1, "Name?"),
  jobTitle: z.string().optional().default(""),
  crewId: z.string().optional().default(""),
  hireDate: z.string().optional().default(""),
  language: z.enum(["en", "es"]).default("en"),
});

export async function addEmployeeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const parsed = employeeSchema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the form", message: null };
    }
    const gate = await canAddEmployee(company);
    if (!gate.allowed) {
      return {
        error: `${gate.message} Nothing you have already recorded is affected — upgrade in Billing and add them straight away.`,
        message: null,
      };
    }
    const d = parsed.data;
    const db = getDb();
    await db.insert(employees).values({
      companyId: company.id,
      crewId: d.crewId || null,
      name: d.name,
      jobTitle: d.jobTitle || null,
      hireDate: d.hireDate || null,
      language: d.language,
    });
    revalidatePath("/settings/roster");
    revalidatePath("/talks");
    return {
      error: null,
      message: `${d.name} added. They sign on the foreman's phone — no account, no invitation.`,
    };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

export async function toggleEmployeeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const employeeId = str(form, "employeeId");
    const db = getDb();
    const [person] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, company.id)));
    if (!person) return { error: "Not on this roster", message: null };
    await db.update(employees).set({ active: !person.active }).where(eq(employees.id, employeeId));
    revalidatePath("/settings/roster");
    revalidatePath("/talks");
    return {
      error: null,
      message: person.active
        ? `${person.name} marked inactive. Their signatures and certs stay on file — the retention duty is five years.`
        : `${person.name} is back on the roster.`,
    };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

export async function moveEmployeeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { company } = await requireWriter();
    const employeeId = str(form, "employeeId");
    const crewId = str(form, "crewId");
    const db = getDb();
    const [person] = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.companyId, company.id)));
    if (!person) return { error: "Not on this roster", message: null };
    if (crewId) {
      const [crew] = await db
        .select({ id: crews.id })
        .from(crews)
        .where(and(eq(crews.id, crewId), eq(crews.companyId, company.id)));
      if (!crew) return { error: "No such crew", message: null };
    }
    await db.update(employees).set({ crewId: crewId || null }).where(eq(employees.id, employeeId));
    revalidatePath("/settings/roster");
    revalidatePath("/talks");
    return {
      error: null,
      message: crewId
        ? `${person.name} moved.`
        : `${person.name} is a floater now — they appear on every crew's sign-off list.`,
    };
  } catch (err) {
    return { error: message(err), message: null };
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}
