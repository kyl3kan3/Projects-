"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { checklistTemplates, type ContractType, type PartyRole } from "@/db/schema";
import { logAudit } from "@/lib/activity";
import { actorLabel, requireSession } from "@/lib/auth";
import type { AnchorKey } from "@/lib/dates";
import { canEditTemplates } from "@/lib/plans";
import { starterFor, templateTasksSchema, type TemplateTask } from "@/lib/templates";

export interface TemplateState {
  error: string | null;
  ok?: string | null;
  /** Echoed back because React 19 resets the form after the action returns. */
  values?: Record<string, string>;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Save a whole task list at once. The editor posts one row per task, indexed, so
 * a task can be added, retitled, re-owned, re-ruled or deleted in a single
 * submit — a coordinator editing a checklist is doing several of those together.
 */
export async function saveTemplateAction(_prev: TemplateState, form: FormData): Promise<TemplateState> {
  const { user, account } = await requireSession();
  const gate = canEditTemplates(account);
  if (!gate.allowed) return { error: gate.reason };

  const db = getDb();
  const templateId = text(form, "templateId");
  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(
      and(eq(checklistTemplates.id, templateId), eq(checklistTemplates.accountId, account.id)),
    );
  if (!template) return { error: "That template is not on your account." };

  const name = text(form, "name");
  const typed = { name };
  if (!name) return { error: "The template needs a name.", values: typed };

  const count = Number(text(form, "taskCount") || "0");
  const tasks: TemplateTask[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    if (text(form, `delete${i}`) === "1") continue;
    const label = text(form, `label${i}`);
    if (!label) continue;
    const key = (text(form, `key${i}`) || slug(label)).slice(0, 64);
    if (seen.has(key)) return { error: `Two tasks share the key "${key}". Keys must be unique.`, values: typed };
    seen.add(key);

    const hasRule = form.get(`hasRule${i}`) === "on";
    const offsetRaw = text(form, `offset${i}`);
    const offsetDays = Number(offsetRaw);
    if (hasRule && (!Number.isInteger(offsetDays) || Math.abs(offsetDays) > 365)) {
      return { error: `"${label}" needs a whole-number offset between -365 and 365.`, values: typed };
    }

    tasks.push({
      key,
      label,
      ownerRole: (text(form, `owner${i}`) || "tc") as PartyRole,
      docRequired: form.get(`doc${i}`) === "on",
      dateRule: hasRule
        ? {
            anchor: (text(form, `anchor${i}`) || "contract_date") as AnchorKey,
            offsetDays,
            businessDays: form.get(`business${i}`) === "on",
            observeHolidays: form.get(`holidays${i}`) === "on",
          }
        : undefined,
    });
  }

  if (tasks.length === 0) return { error: "A template needs at least one task.", values: typed };
  const parsed = templateTasksSchema.safeParse(tasks);
  if (!parsed.success) {
    return {
      error: `That task list did not validate: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      values: typed,
    };
  }

  await db
    .update(checklistTemplates)
    .set({ name, tasks: parsed.data, updatedAt: new Date() })
    .where(eq(checklistTemplates.id, templateId));
  await logAudit({
    accountId: account.id,
    actor: actorLabel(user),
    action: "template_saved",
    target: name,
    metadata: { taskCount: parsed.data.length },
  });

  revalidatePath("/templates");
  revalidatePath(`/templates/${templateId}`);
  return {
    error: null,
    ok: `Saved — ${parsed.data.length} tasks, ${parsed.data.filter((t) => t.dateRule).length} with a date rule. Files already open keep the dates they were computed with.`,
  };
}

export async function createTemplateAction(_prev: TemplateState, form: FormData): Promise<TemplateState> {
  const { user, account } = await requireSession();
  const gate = canEditTemplates(account);
  if (!gate.allowed) return { error: gate.reason };

  const contractType = (text(form, "contractType") || "buyer") as ContractType;
  const starter = starterFor(contractType);
  const name = text(form, "name") || `${starter.name} (copy)`;

  const [created] = await getDb()
    .insert(checklistTemplates)
    .values({ accountId: account.id, name, contractType, tasks: starter.tasks })
    .returning({ id: checklistTemplates.id });
  await logAudit({
    accountId: account.id,
    actor: actorLabel(user),
    action: "template_created",
    target: name,
  });
  revalidatePath("/templates");
  redirect(`/templates/${created.id}`);
}

function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "task"
  );
}
