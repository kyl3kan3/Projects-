/**
 * src/lib/requirements.ts
 *
 * Requirement templates: the org's insurance addendum, expressed as lines and
 * flags the engine can check.
 *
 * A template in use is never deleted — deleting one would orphan the engagements
 * that point at it, and with them every verdict those engagements ever produced.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  engagements,
  requirementTemplates,
  type Org,
  type RequirementFlags,
  type RequirementLine,
  type RequirementTemplate,
} from "@/db/schema";
import { appendAudit } from "@/lib/audit";
import { COVERAGE_KINDS, COVERAGE_LABELS } from "@/lib/format";
import type { CoverageKind } from "@/db/schema";

export async function listTemplates(orgId: string): Promise<RequirementTemplate[]> {
  const db = getDb();
  return db
    .select()
    .from(requirementTemplates)
    .where(eq(requirementTemplates.orgId, orgId))
    .orderBy(asc(requirementTemplates.name));
}

export async function templateById(
  orgId: string,
  id: string,
): Promise<RequirementTemplate | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(requirementTemplates)
    .where(and(eq(requirementTemplates.id, id), eq(requirementTemplates.orgId, orgId)));
  return row ?? null;
}

/** How many active engagements each template governs — the blast radius's size. */
export async function templateUsage(orgId: string): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      templateId: engagements.requirementTemplateId,
      n: sql<number>`count(*)::int`,
    })
    .from(engagements)
    .innerJoin(
      requirementTemplates,
      eq(requirementTemplates.id, engagements.requirementTemplateId),
    )
    .where(and(eq(requirementTemplates.orgId, orgId), eq(engagements.status, "active")))
    .groupBy(engagements.requirementTemplateId);
  return new Map(rows.map((r) => [r.templateId, r.n]));
}

/* --------------------------------------------------------------- validation */

export interface TemplateDraft {
  name: string;
  lines: RequirementLine[];
  flags: RequirementFlags;
  notes: string | null;
}

/** Validate a draft, returning the cleaned version or a sentence to show. */
export function validateDraft(draft: TemplateDraft): { ok: true; draft: TemplateDraft } | { ok: false; error: string } {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: "Give the template a name — vendors see it on nothing, but you will." };
  if (!draft.lines.length) {
    return {
      ok: false,
      error:
        "A template with no coverage lines cannot check anything. Add at least one required line and its minimum limit.",
    };
  }
  const seen = new Set<CoverageKind>();
  const lines: RequirementLine[] = [];
  for (const line of draft.lines) {
    if (!COVERAGE_KINDS.includes(line.coverage)) {
      return { ok: false, error: `"${line.coverage}" is not a coverage CertShield reads.` };
    }
    if (seen.has(line.coverage) && line.coverage !== "other") {
      return {
        ok: false,
        error: `${COVERAGE_LABELS[line.coverage]} is listed twice. One minimum per coverage line.`,
      };
    }
    seen.add(line.coverage);
    if (!Number.isInteger(line.minCents) || line.minCents <= 0) {
      return {
        ok: false,
        error: `${line.label || COVERAGE_LABELS[line.coverage]} needs a minimum limit above zero.`,
      };
    }
    lines.push({
      coverage: line.coverage,
      label: (line.label || COVERAGE_LABELS[line.coverage]).trim().slice(0, 120),
      minCents: line.minCents,
    });
  }
  return {
    ok: true,
    draft: {
      name: name.slice(0, 120),
      lines,
      flags: {
        additionalInsured: Boolean(draft.flags.additionalInsured),
        waiverOfSubrogation: Boolean(draft.flags.waiverOfSubrogation),
        primaryNonContributory: Boolean(draft.flags.primaryNonContributory),
      },
      notes: draft.notes?.trim() ? draft.notes.trim().slice(0, 2000) : null,
    },
  };
}

export async function createTemplate(
  org: Org,
  actor: string,
  draft: TemplateDraft,
): Promise<RequirementTemplate> {
  const checked = validateDraft(draft);
  if (!checked.ok) throw new Error(checked.error);
  const db = getDb();
  const [row] = await db
    .insert(requirementTemplates)
    .values({ orgId: org.id, ...checked.draft })
    .returning();
  await appendAudit({
    orgId: org.id,
    actor,
    action: "template.created",
    target: row.name,
    metadata: { templateId: row.id, lines: row.lines.length },
  });
  return row;
}

export async function updateTemplate(
  org: Org,
  actor: string,
  templateId: string,
  draft: TemplateDraft,
): Promise<RequirementTemplate> {
  const checked = validateDraft(draft);
  if (!checked.ok) throw new Error(checked.error);
  const before = await templateById(org.id, templateId);
  if (!before) throw new Error("That template is not in your requirements.");
  const db = getDb();
  const [row] = await db
    .update(requirementTemplates)
    .set({ ...checked.draft, updatedAt: new Date() })
    .where(and(eq(requirementTemplates.id, templateId), eq(requirementTemplates.orgId, org.id)))
    .returning();
  await appendAudit({
    orgId: org.id,
    actor,
    action: "template.updated",
    target: row.name,
    metadata: {
      templateId: row.id,
      linesBefore: before.lines.length,
      linesAfter: row.lines.length,
      flags: row.flags,
    },
  });
  return row;
}

/** A short human summary of a template, for the vendor row and the binder page. */
export function summariseTemplate(template: RequirementTemplate): string {
  const parts = template.lines.map(
    (l) => `${l.label || COVERAGE_LABELS[l.coverage]} ≥ $${Math.round(l.minCents / 100).toLocaleString("en-US")}`,
  );
  const flags: string[] = [];
  if (template.flags.additionalInsured) flags.push("additional insured");
  if (template.flags.waiverOfSubrogation) flags.push("waiver of subrogation");
  return [parts.join(" · "), flags.length ? `plus ${flags.join(" and ")}` : ""]
    .filter(Boolean)
    .join(" · ");
}
